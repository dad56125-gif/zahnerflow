import type { ExecutionPhase } from '@zahnerflow/types';
import type { ExecutionCommand, ExecutionCommandState } from './executionStateModel';
import { executionPhases } from './executionStateModel';

/**
 * 工作流命令共用机制：把 start/pause/resume/cancel/reset 的重复请求、pending、
 * 失败与快照复核规则集中到一处。这里只读公共执行 phase，不解释节点类型，
 * 也不引入 runtimeClient 之外的第二通信路径。
 *
 * 复核只有一条链：命令确认读取与后续轮询共用同一条链，发请求前就启动，收到快照
 * 不会另起或替换在途 scope。读取失败只退避重试并给出明确错误，只在终态/命令收口
 * 或作用域失效时停止，不因失败次数停止。
 */

/** 停止/终态等待的基准复核间隔；读取失败时按倍率退避到上限。 */
const RECHECK_BASE_INTERVAL_MS = 500;
const RECHECK_MAX_INTERVAL_MS = 4000;

export const idleExecutionCommand = (): ExecutionCommandState => ({ pending: null, error: null });

const messageOf = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : '';
  return message || fallback;
};

/**
 * 命令是否已被后端快照确认。终态对除 reset 之外的命令都算收口；
 * 其余按各自目标 phase 判定。判定只看公共执行 phase，不看节点类型。
 */
export const commandSatisfiedByPhase = (
  command: ExecutionCommand | null,
  phase: ExecutionPhase,
): boolean => {
  if (!command) return false;
  if (command !== 'reset' && executionPhases[phase].is.terminal) return true;
  switch (command) {
    case 'start':
      return phase !== 'idle';
    case 'pause':
      return phase === 'paused';
    case 'resume':
      return phase === 'running';
    case 'cancel':
      return phase === 'cancelling' || phase === 'cancelled';
    case 'reset':
      return phase === 'idle';
    default:
      return false;
  }
};

export interface ExecutionCommandSpec<T> {
  kind: ExecutionCommand;
  /** 发送命令。抛错代表后端未受理或返回业务失败；受理不代表 phase 已确认。 */
  send: () => Promise<T>;
  /** 后端受理后写入已确认事实（例如启动返回的执行身份）。 */
  onAccepted?: (accepted: T) => void;
  /** 失败文案；返回 null 表示不写入错误（例如缺失运行信息交由调用方处理）。 */
  failureMessage?: (error: unknown) => string | null;
  /** 命令发起前已有的执行身份；start 用它挡掉旧执行的终态快照。 */
  previousExecutionId?: string | null;
}

export interface ExecutionCommandDependencies {
  readCommand: () => ExecutionCommandState;
  writeCommand: (next: ExecutionCommandState) => void;
  readPhase: () => ExecutionPhase;
  readRuntimeId: () => string | null;
  readExecutionId: () => string | null;
  refreshSnapshot: () => Promise<void>;
}

export interface ExecutionCommandOutcome<T> {
  /** 后端是否受理。受理不等于 phase 已确认，phase 只由快照确认。 */
  accepted: boolean;
  acceptedValue?: T;
  error?: unknown;
}

export interface ExecutionCommandCoordinator {
  /** 纯状态判定：按快照 phase/执行身份决定保留还是清空 pending。 */
  reconcileCommand: (phase: ExecutionPhase, executionId: string | null) => ExecutionCommandState;
  /** 快照到达后的副作用：已有链时不替换在途 scope，只在需要时启动唯一复核链。 */
  noteSnapshot: (phase: ExecutionPhase, executionId: string | null) => void;
  /** 执行一次命令；重复与并发请求被单飞行吞掉，ACK 不伪造 phase。 */
  execute: <T>(spec: ExecutionCommandSpec<T>) => Promise<ExecutionCommandOutcome<T>>;
  /** 运行时或工作区身份变化：取消旧链、作废旧回调写入资格。 */
  invalidateScope: () => void;
}

/** active 只认它写入的 command 对象引用；同 kind 的新命令或教学恢复都不会被误认。 */
interface ActiveCommand {
  token: number;
  command: ExecutionCommandState;
  /** 命令发起前已有的执行身份，用于识别旧执行的终态快照。 */
  previousExecutionId: string | null;
}

/** 唯一复核链：命令确认读取与后续轮询都走这里，scope 在链生命期内保持不变。 */
interface RecheckChain {
  token: number;
  runtimeId: string | null;
  executionId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
}

export function createExecutionCommandCoordinator(
  deps: ExecutionCommandDependencies,
): ExecutionCommandCoordinator {
  let nextToken = 0;
  let active: ActiveCommand | null = null;
  let chain: RecheckChain | null = null;
  let interval = RECHECK_BASE_INTERVAL_MS;

  const currentActive = (): ActiveCommand | null =>
    active && deps.readCommand() === active.command ? active : null;

  const scopeMatches = (owner: RecheckChain): boolean => {
    const runtimeId = deps.readRuntimeId();
    const executionId = deps.readExecutionId();
    if (owner.runtimeId !== null && runtimeId !== null && owner.runtimeId !== runtimeId) return false;
    if (owner.executionId !== null && executionId !== null && owner.executionId !== executionId) return false;
    return true;
  };

  /**
   * start 只能被“新执行”的终态收口。HTTP 快照读取每次都会推进 snapshotSequence，
   * 发起前那份旧执行的终态会以新序号返回，不能因此提前解锁 start。
   * 有效终态（新执行身份）立即收口，不依赖 HTTP ACK。
   */
  const settledBy = (
    command: ExecutionCommand,
    phase: ExecutionPhase,
    executionId: string | null,
  ): boolean => {
    if (!commandSatisfiedByPhase(command, phase)) return false;
    if (command === 'start' && executionPhases[phase].is.terminal) {
      const previous = active?.previousExecutionId ?? null;
      if (executionId !== null && previous !== null && executionId === previous) return false;
    }
    return true;
  };

  /** 需要复核的公共事实：仍有未收口命令，或快照处于停止中。 */
  const needsRecheck = (phase: ExecutionPhase, executionId: string | null): boolean => {
    if (phase === 'cancelling') return true;
    const command = deps.readCommand().pending;
    if (command === null) return false;
    return !settledBy(command, phase, executionId);
  };

  const writeCommandError = (message: string | null): void => {
    const current = deps.readCommand();
    if (current.error === message) return;
    const next: ExecutionCommandState = { pending: current.pending, error: message };
    deps.writeCommand(next);
    // 内部错误写入只是给同一条命令换对象：仍是我们写入的命令时把 active 指向新对象，
    // 保持受理/复核链不断；外部覆盖过命令时不更新，旧请求继续失效。
    if (active && active.command === current) active.command = next;
  };

  const stopChain = (): void => {
    if (chain && chain.timer !== null) clearTimeout(chain.timer);
    chain = null;
    interval = RECHECK_BASE_INTERVAL_MS;
  };

  const scheduleTick = (): void => {
    const owner = chain;
    if (!owner || owner.timer !== null || owner.inFlight) return;
    owner.timer = setTimeout(() => {
      void runTick(owner);
    }, interval);
  };

  async function runTick(owner: RecheckChain): Promise<void> {
    if (chain !== owner) return;
    // 复用同一条链或两个 ACK 可能重复进入：已有在途读取时直接退出，避免并发重入。
    if (owner.inFlight) return;
    if (owner.timer !== null) {
      clearTimeout(owner.timer);
      owner.timer = null;
    }
    owner.inFlight = true;

    let keepGoing = false;
    if (scopeMatches(owner) && needsRecheck(deps.readPhase(), deps.readExecutionId())) {
      let failure: unknown = null;
      try {
        await deps.refreshSnapshot();
      } catch (error) {
        failure = error;
      }
      if (chain !== owner) {
        owner.inFlight = false;
        return;
      }
      if (scopeMatches(owner) && needsRecheck(deps.readPhase(), deps.readExecutionId())) {
        if (failure !== null) {
          // 读取失败不终止复核：退避后继续，只提示明确错误。
          interval = Math.min(interval * 2, RECHECK_MAX_INTERVAL_MS);
          writeCommandError(`执行状态同步失败：${messageOf(failure, '网络错误')}`);
        } else {
          interval = RECHECK_BASE_INTERVAL_MS;
        }
        keepGoing = true;
      }
    }

    owner.inFlight = false;
    if (chain !== owner) return;
    if (keepGoing) scheduleTick();
    else stopChain();
  }

  const claimChain = (): RecheckChain => {
    if (chain && scopeMatches(chain)) return chain;
    if (chain) stopChain();
    const owner: RecheckChain = {
      token: ++nextToken,
      runtimeId: deps.readRuntimeId(),
      executionId: deps.readExecutionId(),
      timer: null,
      inFlight: false,
    };
    chain = owner;
    interval = RECHECK_BASE_INTERVAL_MS;
    return owner;
  };

  const reconcileCommand = (
    phase: ExecutionPhase,
    executionId: string | null,
  ): ExecutionCommandState => {
    const current = deps.readCommand();
    if (current.pending === null || !settledBy(current.pending, phase, executionId)) return current;
    active = null;
    return idleExecutionCommand();
  };

  const noteSnapshot = (phase: ExecutionPhase, executionId: string | null): void => {
    // 只有一条链：已有在途链时不替换其 scope，交给链自身按公共事实收口。
    if (chain) return;
    if (!needsRecheck(phase, executionId)) return;
    claimChain();
    scheduleTick();
  };

  const execute = async <T>(spec: ExecutionCommandSpec<T>): Promise<ExecutionCommandOutcome<T>> => {
    if (currentActive()) {
      return { accepted: false, error: new Error('已有执行命令进行中') };
    }
    const token = ++nextToken;
    const command: ExecutionCommandState = { pending: spec.kind, error: null };
    active = {
      token,
      command,
      previousExecutionId: spec.previousExecutionId ?? null,
    };
    // 先占用唯一复核链，避免 HTTP 还在途时 Socket 再起第二条链。
    const owner = claimChain();
    deps.writeCommand(command);
    // 发请求前就启动同链复核：ACK 慢或丢失时仍靠 Socket/HTTP 快照收敛。
    scheduleTick();

    let value: T;
    try {
      value = await spec.send();
    } catch (error) {
      // 失败也先经同一条链复核一次后端快照：Socket 可能漏收终态，
      // 缓存里的 active 可能已过期，不能直接按缓存判错。
      if (currentActive()?.token === token) {
        try {
          await deps.refreshSnapshot();
        } catch {
          // 复核本身失败时保留原命令失败，交由下方按公共 phase 决定。
        }
      }

      const message = spec.failureMessage
        ? spec.failureMessage(error)
        : messageOf(error, '操作失败');
      const settledBySnapshot = currentActive()?.token !== token;
      if (!settledBySnapshot) {
        // 失败命令清 pending：展示失败并允许重试，不伪造命令仍在途。
        // 只有仍是本次命令时才写：已被复核快照收口、作用域失效或新命令已接管时
        // 都不写过期错误，也不改动当前 command。
        active = null;
        deps.writeCommand({ pending: null, error: message });
      }
      if (chain === owner && !needsRecheck(deps.readPhase(), deps.readExecutionId())) {
        // 只有公共 phase 仍需要复核（例如已进入 cancelling）时才保留这条链。
        stopChain();
      }
      return { accepted: false, error };
    }

    // 只有仍是本次命令对象时才写入已确认事实，避免旧 ACK 改到新命令的身份。
    if (currentActive()?.token === token) spec.onAccepted?.(value);
    // 确认读取属于同一条链：期间 noteSnapshot 不会另起链。
    await runTick(owner);
    return { accepted: true, acceptedValue: value };
  };

  const invalidateScope = (): void => {
    stopChain();
    active = null;
    nextToken += 1;
    // 旧运行时/工作区事实失效：未收口命令作废，交由新快照重新确认。
    if (deps.readCommand().pending !== null) deps.writeCommand(idleExecutionCommand());
  };

  return { reconcileCommand, noteSnapshot, execute, invalidateScope };
}
