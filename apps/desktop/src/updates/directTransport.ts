/**
 * 桌面更新直连传输层（只在 Electron 主进程使用）。
 *
 * 边界与约定：
 * - 只允许 https、443 端口、无 userinfo 的 api.github.com Release 接口
 *   （/repos/dad56125-gif/zahnerflow/releases 前缀，含该前缀下的 assets 路径）
 *   与 release-assets.githubusercontent.com 官方附件节点；请求失败不回退到其他域名。
 * - 不自动跟随重定向：状态码、Location、Content-Range 全部交给调用方处理。
 * - 只使用 Node 内置 https 与自建 Agent，不使用全局 Agent，也不读取任何代理环境变量。
 * - 候选地址在运行时解析（国内 DoH + 系统 DNS）并按实际 TTL 缓存，不内置任何固定 IP。
 * - 保留原始域名、SNI 与默认证书校验；不提供任何绕过 TLS 校验的开关。
 * - 不携带任何凭据；错误信息不包含签名链接与查询串。
 * - 失败一律抛出中文错误，绝不把失败返回成“已是最新版本”。
 */
import { lookup as systemLookup } from 'node:dns';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { Agent, request as httpsRequest, type RequestOptions } from 'node:https';

const UPDATE_API_HOST = 'api.github.com';
const UPDATE_RELEASE_PATH_PREFIX = '/repos/dad56125-gif/zahnerflow/releases';
const UPDATE_ASSET_HOST = 'release-assets.githubusercontent.com';

const PUBLIC_USER_AGENT = 'ZahnerFlow-updater';
const HTTPS_PORT = 443;

/** 等待响应头的上限；连接建立与首字节都计入这段时间。 */
const HEADER_WAIT_TIMEOUT_MS = 8_000;
/** 响应体空闲上限：收到响应头后，超过这段时间没有新数据就中断。 */
const BODY_IDLE_TIMEOUT_MS = 15_000;
/** 单次域名解析（DoH 与系统 DNS 各自）的时间上限。 */
const RESOLUTION_DEADLINE_MS = 4_000;
/** 单次 request 调用（含解析与多候选重试）的总时限；拿到响应头后即解除。 */
const REQUEST_TOTAL_BUDGET_MS = 25_000;

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const RESOLVER_BODY_LIMIT_BYTES = 64 * 1024;

const MAX_CONNECT_TRIES = 4;
const RETRY_BACKOFF_MS = 200;

/** 缓存时长上限；实际 TTL 小于上限时按实际值，0 与 1 秒同样如实生效。 */
const MAX_CACHE_TTL_SECONDS = 300;
const SYSTEM_DNS_TTL_SECONDS = 30;
const DEFAULT_DOH_TTL_SECONDS = 60;

const DOH_RESOLVERS = [
  { label: '阿里公共 DoH', endpoint: 'https://dns.alidns.com/resolve' },
  { label: '腾讯公共 DoH', endpoint: 'https://doh.pub/dns-query' },
] as const;

/** 调用方不能覆盖的请求头：Host/凭据/连接语义由传输层固定。 */
const CALLER_HEADER_BLOCKLIST = new Set([
  'host',
  'authorization',
  'cookie',
  'proxy-authorization',
  'user-agent',
  'content-length',
  'connection',
  'transfer-encoding',
]);

interface StartRequestOptions {
  target: URL;
  /** 本次连接固定使用的候选地址；为 null 时按系统 DNS 解析（仅用于 DoH 解析器自身）。 */
  pinnedAddress: string | null;
  headers: Record<string, string>;
  signal: AbortSignal;
  agent: Agent;
  headerTimeoutMs: number;
  idleTimeoutMs: number;
}

interface DohResult {
  addresses: string[];
  ttlSeconds: number | null;
}

interface ResolutionJob {
  promise: Promise<string[]>;
  waiters: number;
  controller: AbortController;
}

interface SignalBudget {
  signal: AbortSignal;
  /** 拿到响应后解除本地时限，同时保留调用方取消的传递。 */
  releaseTimer: () => void;
  timedOut: () => boolean;
  dispose: () => void;
}

/** 把调用方信号与本地时限合成一个信号；超时与取消都会中止在途连接。 */
function createSignalBudget(source: AbortSignal, budgetMs: number): SignalBudget {
  const controller = new AbortController();
  let timedOut = false;
  let disposed = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, budgetMs);
  const onSourceAbort = (): void => controller.abort();
  if (source.aborted) controller.abort();
  else source.addEventListener('abort', onSourceAbort, { once: true });

  const releaseTimer = (): void => {
    clearTimeout(timer);
  };

  return {
    signal: controller.signal,
    releaseTimer,
    timedOut: () => timedOut,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      releaseTimer();
      source.removeEventListener('abort', onSourceAbort);
    },
  };
}

function createAbortError(): Error {
  const error = new Error('更新请求已取消');
  error.name = 'AbortError';
  return error;
}

/** 校验允许的更新请求地址；非法地址直接抛出中文错误。 */
function parseAllowedUpdateUrl(raw: string): URL {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new Error('更新请求地址无效');
  }

  if (target.protocol !== 'https:') throw new Error('更新服务只允许使用 HTTPS 直连');
  if (target.port !== '' && target.port !== '443') throw new Error('更新服务只允许使用 443 端口');
  if (target.username !== '' || target.password !== '') throw new Error('更新请求地址不允许携带用户名或密码');

  if (target.hostname === UPDATE_API_HOST) {
    const path = target.pathname.toLowerCase();
    if (path !== UPDATE_RELEASE_PATH_PREFIX && !path.startsWith(`${UPDATE_RELEASE_PATH_PREFIX}/`)) {
      throw new Error(`更新接口只允许访问 ${UPDATE_API_HOST}${UPDATE_RELEASE_PATH_PREFIX} 下的 Release 路径`);
    }
    return target;
  }
  if (target.hostname === UPDATE_ASSET_HOST) return target;

  throw new Error(`更新请求只允许访问 ${UPDATE_API_HOST} 与 ${UPDATE_ASSET_HOST} 两个官方地址`);
}

function buildRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {
    'User-Agent': PUBLIC_USER_AGENT,
    // 二进制与 Range 下载按原始字节处理，避免压缩后无法校验长度与摘要。
    'Accept-Encoding': 'identity',
  };
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value !== 'string') continue;
    if (CALLER_HEADER_BLOCKLIST.has(key.toLowerCase())) continue;
    merged[key] = value;
  }
  return merged;
}

/** 把连接固定到本次候选地址，同时保持原始 host 与 SNI。 */
function createPinnedLookup(address: string): RequestOptions['lookup'] {
  const lookup = (
    _hostname: string,
    options: { all?: boolean },
    callback: (error: NodeJS.ErrnoException | null, resolved?: unknown, family?: number) => void,
  ): void => {
    if (options?.all) {
      callback(null, [{ address, family: 4 }]);
      return;
    }
    callback(null, address, 4);
  };
  return lookup as RequestOptions['lookup'];
}

/** 拒绝回环、私网、链路本地、CGNAT、组播与保留网段，只保留公网 IPv4。 */
function isPublicIPv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const octet = Number(part);
    if (octet > 255) return false;
    octets.push(octet);
  }

  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  if (first >= 224) return false;
  return true;
}

/** DoH JSON 应答中提取 A 记录地址与最小 TTL。 */
function extractDohAddresses(payload: unknown): DohResult {
  const empty: DohResult = { addresses: [], ttlSeconds: null };
  if (typeof payload !== 'object' || payload === null) return empty;

  const answers = (payload as { Answer?: unknown }).Answer;
  if (!Array.isArray(answers)) return empty;

  const addresses: string[] = [];
  let ttlSeconds: number | null = null;
  for (const answer of answers) {
    if (typeof answer !== 'object' || answer === null) continue;
    const record = answer as { type?: unknown; data?: unknown; TTL?: unknown };
    if (record.type !== 1) continue;
    if (typeof record.data !== 'string' || !isPublicIPv4(record.data)) continue;
    if (!addresses.includes(record.data)) addresses.push(record.data);
    // TTL 为 0 或 1 秒同样按实际值使用，不向上取整。
    if (typeof record.TTL === 'number' && Number.isFinite(record.TTL) && record.TTL >= 0) {
      ttlSeconds = ttlSeconds === null ? record.TTL : Math.min(ttlSeconds, record.TTL);
    }
  }
  return { addresses, ttlSeconds };
}

function rotateCandidates(addresses: string[], attempt: number): string[] {
  if (addresses.length <= 1) return [...addresses];
  const normalized = Number.isFinite(attempt) ? Math.trunc(attempt) : 0;
  const start = ((normalized % addresses.length) + addresses.length) % addresses.length;
  return [...addresses.slice(start), ...addresses.slice(0, start)];
}

/** 只暴露错误类别，避免把带签名查询串的原始信息带进提示文本。 */
function describeErrorCause(error: Error | null): string {
  if (error === null) return '原因未知';
  const code = (error as NodeJS.ErrnoException).code;
  if (typeof code === 'string' && code !== '' && /^[A-Z0-9_]+$/.test(code)) return code;
  if (error.name === 'AbortError') return '请求已被取消';
  return error.message.slice(0, 80);
}

function headerText(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

/** 非 200 的查询失败一律给出中文说明，并明确本次检查没有结论。 */
function describeJsonFailure(response: IncomingMessage, target: URL): string {
  const status = response.statusCode ?? 0;
  const endpoint = `${target.origin}${target.pathname}`;
  const remaining = headerText(response, 'x-ratelimit-remaining');
  const reset = headerText(response, 'x-ratelimit-reset');
  const retryAfter = headerText(response, 'retry-after');
  const rateLimited = status === 429 || (status === 403 && (remaining === '0' || retryAfter !== null));

  if (rateLimited) {
    const resetSeconds = reset === null ? Number.NaN : Number(reset);
    const resetText = Number.isFinite(resetSeconds)
      ? `，限额预计在 ${new Date(resetSeconds * 1_000).toISOString()} 恢复`
      : '';
    const retryText = retryAfter === null ? '' : `，建议 ${retryAfter} 秒后重试`;
    return `GitHub 匿名访问频率受限（HTTP ${status}）${resetText}${retryText}；本次检查未完成，无法判断是否已是最新版本`;
  }
  if (status === 403) {
    return `更新接口拒绝访问（HTTP 403：${endpoint}）；本次检查未完成，无法判断是否已是最新版本`;
  }
  return `更新接口返回 HTTP ${status}（${endpoint}）；本次检查未完成，无法判断是否已是最新版本`;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 授权更新源的直连传输层。
 *
 * 调用方负责状态码、重定向与 Content-Range 语义；本类只保证地址受限、
 * 候选地址轮换、超时、取消与响应体的空闲中断。
 */
export class DirectUpdateTransport {
  /**
   * DoH 解析器专用 Agent：解析器自身只走系统 DNS，不依赖本模块解析出的候选地址，
   * 避免解析链路自我引用。
   */
  readonly #resolverAgent = new Agent({ keepAlive: true, maxSockets: 4, maxFreeSockets: 2, keepAliveMsecs: 1_000 });

  /**
   * 更新请求按“域名 + 候选地址”分池。keep-alive 连接会被复用，
   * 如果所有候选地址共用一个 Agent，池里的旧连接会绕过本次候选地址，
   * 因此每个“域名 + 地址”组合持有独立 Agent。
   */
  readonly #requestAgents = new Map<string, Agent>();
  readonly #addressCache = new Map<string, { addresses: string[]; expiresAt: number }>();
  readonly #resolutionJobs = new Map<string, ResolutionJob>();
  #disposed = false;

  /**
   * 发起一次更新源请求并返回仍在流式传输的响应。
   * 候选地址按 attempt 轮换；只对“建连到响应头”阶段的失败在候选之间重试，次数有上限，
   * 不会因为 HTTP 状态码或响应体错误反复重发。
   */
  async request(
    url: string,
    signal: AbortSignal,
    headers: Record<string, string> = {},
    attempt = 0,
  ): Promise<IncomingMessage> {
    this.#assertUsable();
    const target = parseAllowedUpdateUrl(url);
    if (signal.aborted) throw createAbortError();

    // 调用方没有提供时限时，本调用（解析 + 多候选重试）整体仍有 25 秒上限；
    // 拿到响应头后立即解除，长时间下载由调用方的取消与空闲超时负责。
    const budget = createSignalBudget(signal, REQUEST_TOTAL_BUDGET_MS);
    try {
      const addresses = await this.#resolveAddresses(target.hostname, budget.signal);
      const order = rotateCandidates(addresses, attempt);
      const tryLimit = Math.min(Math.max(order.length, 2), MAX_CONNECT_TRIES);

      let lastError: Error | null = null;
      for (let index = 0; index < tryLimit; index += 1) {
        if (budget.signal.aborted) throw createAbortError();
        if (index > 0) await sleepWithAbort(RETRY_BACKOFF_MS, budget.signal);

        const address = order[index % order.length];
        try {
          const response = await this.#startRequest({
            target,
            pinnedAddress: address,
            headers,
            signal: budget.signal,
            agent: this.#agentFor(target.hostname, address),
            headerTimeoutMs: HEADER_WAIT_TIMEOUT_MS,
            idleTimeoutMs: BODY_IDLE_TIMEOUT_MS,
          });
          budget.releaseTimer();
          response.once('close', () => budget.dispose());
          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (budget.signal.aborted) throw createAbortError();
        }
      }

      // 所有候选都失败说明缓存地址可能已经不可用，丢弃后由下一次调用重新解析。
      this.#addressCache.delete(target.hostname);
      throw new Error(
        `无法连接更新服务 ${target.hostname}：已尝试 ${tryLimit} 个候选地址仍失败（${describeErrorCause(lastError)}）`,
      );
    } catch (error) {
      budget.dispose();
      if (budget.timedOut()) {
        throw new Error(
          `更新请求在 ${Math.round(REQUEST_TOTAL_BUDGET_MS / 1000)} 秒内未能完成（含候选地址重试），已中止`,
        );
      }
      throw error;
    }
  }

  /**
   * 读取一个受限的 JSON 接口。只有 HTTP 200 且内容为有效 JSON 才返回结果；
   * 网络、限额、状态码与解析失败都会抛出中文错误，不会返回空对象冒充“已是最新版本”。
   */
  async json(url: string, signal: AbortSignal): Promise<unknown> {
    this.#assertUsable();
    const target = parseAllowedUpdateUrl(url);
    const response = await this.request(target.href, signal, {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    const status = response.statusCode ?? 0;
    if (status !== 200) {
      const failure = describeJsonFailure(response, target);
      response.destroy();
      throw new Error(failure);
    }

    const body = await this.#readBounded(
      response,
      MAX_JSON_BYTES,
      signal,
      '更新接口响应超过 2 MiB 上限，已停止读取',
    );
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error('更新接口返回的内容不是有效 JSON，无法判断版本信息');
    }
  }

  /** 释放 Agent 与缓存；释放后所有请求立即失败。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    for (const job of this.#resolutionJobs.values()) job.controller.abort();
    this.#resolutionJobs.clear();
    this.#addressCache.clear();
    for (const agent of this.#requestAgents.values()) agent.destroy();
    this.#requestAgents.clear();
    this.#resolverAgent.destroy();
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error('更新传输层已释放，无法继续发起请求');
  }

  #agentFor(hostname: string, address: string): Agent {
    const key = `${hostname}/${address}`;
    let agent = this.#requestAgents.get(key);
    if (!agent) {
      // Only retire idle pools; refreshing DNS must not cancel active chunks.
      for (const [oldKey, old] of this.#requestAgents) {
        if (this.#requestAgents.size < 16) break;
        if (Object.values(old.sockets).every(sockets => !sockets?.length)) {
          old.destroy(); this.#requestAgents.delete(oldKey);
        }
      }
      agent = new Agent({ keepAlive: true, maxSockets: 4, maxFreeSockets: 1 });
      this.#requestAgents.set(key, agent);
    }
    return agent;
  }

  async #resolveAddresses(hostname: string, callerSignal: AbortSignal): Promise<string[]> {
    const cached = this.#addressCache.get(hostname);
    if (cached !== undefined && cached.expiresAt > Date.now() && cached.addresses.length > 0) {
      return cached.addresses;
    }

    // 并发调用共享同一轮解析，避免下载分片同时触发多份 DoH 查询。
    const job = this.#acquireResolution(hostname);
    try {
      return await raceWithAbort(job.promise, callerSignal);
    } finally {
      job.waiters -= 1;
      if (job.waiters <= 0) job.controller.abort();
    }
  }

  #acquireResolution(hostname: string): ResolutionJob {
    const existing = this.#resolutionJobs.get(hostname);
    if (existing !== undefined) {
      existing.waiters += 1;
      return existing;
    }

    const controller = new AbortController();
    const job: ResolutionJob = {
      waiters: 1,
      controller,
      promise: this.#resolveCandidates(hostname, controller.signal),
    };
    this.#resolutionJobs.set(hostname, job);
    job.promise
      .catch(() => undefined)
      .finally(() => {
        if (this.#resolutionJobs.get(hostname) === job) this.#resolutionJobs.delete(hostname);
      });
    return job;
  }

  async #resolveCandidates(hostname: string, signal: AbortSignal): Promise<string[]> {
    const [dohResults, systemAddresses] = await Promise.all([
      Promise.all(DOH_RESOLVERS.map((resolver) => this.#queryDoh(resolver, hostname, signal))),
      this.#systemDns(hostname, signal),
    ]);

    if (signal.aborted) throw createAbortError();

    const addresses: string[] = [];
    let ttlSeconds: number | null = null;
    let resolvedByDoh = false;
    for (const result of dohResults) {
      if (result.addresses.length === 0) continue;
      resolvedByDoh = true;
      for (const address of result.addresses) {
        if (!addresses.includes(address)) addresses.push(address);
      }
      if (result.ttlSeconds !== null) {
        ttlSeconds = ttlSeconds === null ? result.ttlSeconds : Math.min(ttlSeconds, result.ttlSeconds);
      }
    }
    for (const address of systemAddresses.filter(isPublicIPv4)) {
      if (!addresses.includes(address)) addresses.push(address);
    }

    if (addresses.length === 0) {
      throw new Error(`无法解析更新服务域名 ${hostname}：系统 DNS 与国内 DoH 均未返回可用地址，更新检查失败`);
    }

    const effectiveTtl = resolvedByDoh ? (ttlSeconds ?? DEFAULT_DOH_TTL_SECONDS) : SYSTEM_DNS_TTL_SECONDS;
    const ttl = Math.min(Math.max(effectiveTtl, 0), systemAddresses.length ? SYSTEM_DNS_TTL_SECONDS : MAX_CACHE_TTL_SECONDS, MAX_CACHE_TTL_SECONDS);
    this.#addressCache.set(hostname, { addresses, expiresAt: Date.now() + ttl * 1_000 });
    return addresses;
  }

  async #queryDoh(
    resolver: (typeof DOH_RESOLVERS)[number],
    hostname: string,
    signal: AbortSignal,
  ): Promise<DohResult> {
    const empty: DohResult = { addresses: [], ttlSeconds: null };
    const budget = createSignalBudget(signal, RESOLUTION_DEADLINE_MS);
    try {
      const target = new URL(resolver.endpoint);
      target.searchParams.set('name', hostname);
      target.searchParams.set('type', 'A');

      const response = await this.#startRequest({
        target,
        pinnedAddress: null,
        headers: { Accept: 'application/dns-json' },
        signal: budget.signal,
        agent: this.#resolverAgent,
        headerTimeoutMs: RESOLUTION_DEADLINE_MS,
        idleTimeoutMs: RESOLUTION_DEADLINE_MS,
      });
      if (response.statusCode !== 200) {
        response.destroy();
        return empty;
      }
      const body = await this.#readBounded(
        response,
        RESOLVER_BODY_LIMIT_BYTES,
        budget.signal,
        `${resolver.label} 响应超过读取上限`,
      );
      return extractDohAddresses(JSON.parse(body) as unknown);
    } catch {
      return empty;
    } finally {
      budget.dispose();
    }
  }

  /** 系统 DNS 只作为补充来源，严格限制在同一个解析时限内。 */
  #systemDns(hostname: string, signal: AbortSignal): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finish = (addresses: string[]): void => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(addresses);
      };
      const onAbort = (): void => finish([]);

      timer = setTimeout(() => finish([]), RESOLUTION_DEADLINE_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      systemLookup(hostname, { all: true, family: 4, verbatim: true }, (error, records) => {
        if (error !== null || !records) {
          finish([]);
          return;
        }
        finish(records.filter((record) => record.family === 4).map((record) => record.address));
      });
    });
  }

  #startRequest(options: StartRequestOptions): Promise<IncomingMessage> {
    const { target, pinnedAddress, headers, signal, agent, headerTimeoutMs, idleTimeoutMs } = options;

    const requestOptions: RequestOptions = {
      protocol: 'https:',
      host: target.hostname,
      port: HTTPS_PORT,
      servername: target.hostname,
      method: 'GET',
      path: `${target.pathname}${target.search}`,
      agent,
      headers: buildRequestHeaders(headers),
      // 不改动证书校验、SNI 与主机名校验；此处禁止出现任何 TLS 绕过选项。
    };
    if (pinnedAddress !== null) requestOptions.lookup = createPinnedLookup(pinnedAddress);

    return new Promise<IncomingMessage>((resolve, reject) => {
      let settled = false;
      let response: IncomingMessage | null = null;
      let headerTimer: NodeJS.Timeout | null = null;
      let releaseResponseGuards: (() => void) | null = null;

      const clearHeaderTimer = (): void => {
        if (headerTimer !== null) {
          clearTimeout(headerTimer);
          headerTimer = null;
        }
      };
      const detachAbort = (): void => signal.removeEventListener('abort', onAbort);
      const failBeforeResponse = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearHeaderTimer();
        detachAbort();
        reject(error);
      };

      function onAbort(): void {
        const abortError = createAbortError();
        if (response !== null) {
          response.destroy(abortError);
          return;
        }
        if (settled) return;
        failBeforeResponse(abortError);
        request.destroy(abortError);
      }

      let request: ClientRequest;
      try {
        request = httpsRequest(requestOptions);
        request.on('error', (error: Error) => failBeforeResponse(error));
      } catch (error) {
        failBeforeResponse(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      headerTimer = setTimeout(() => {
        const error = new Error(`更新服务在 ${headerTimeoutMs} 毫秒内未返回响应头，连接已中断`);
        failBeforeResponse(error);
        request.destroy(error);
      }, headerTimeoutMs);

      request.on('response', (incoming) => {
        if (settled) {
          // 已因超时或取消结束，迟到的响应直接丢弃。
          incoming.destroy();
          return;
        }
        settled = true;
        clearHeaderTimer();
        response = incoming;

        const socket = incoming.socket;
        if (socket !== null) {
          const onSocketIdle = (): void => {
            if (incoming.readableEnded || incoming.destroyed) return;
            incoming.destroy(new Error(`更新数据在 ${idleTimeoutMs} 毫秒内没有新内容，连接已中断`));
          };
          socket.setTimeout(idleTimeoutMs);
          socket.on('timeout', onSocketIdle);
          releaseResponseGuards = () => {
            socket.removeListener('timeout', onSocketIdle);
            if (!socket.destroyed) socket.setTimeout(0);
          };
        }

        // 响应交给调用方后仍可能被空闲超时或取消销毁；先挂一个空监听，
        // 避免调用方注册 error 之前产生未捕获异常。
        incoming.on('error', () => undefined);
        incoming.once('close', () => {
          detachAbort();
          releaseResponseGuards?.();
        });
        resolve(incoming);
      });

      request.on('close', () => {
        if (settled) return;
        detachAbort();
        failBeforeResponse(new Error(`更新服务连接在返回响应头前被关闭（${target.hostname}）`));
      });
      request.end();
    });
  }

  /** 有界读取响应体：超过上限立即中断，连接过期或被取消时给出中文错误。 */
  #readBounded(
    response: IncomingMessage,
    limitBytes: number,
    signal: AbortSignal,
    overflowMessage: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;

      const cleanup = (): void => {
        response.removeListener('data', onData);
        response.removeListener('end', onEnd);
        response.removeListener('error', onError);
        response.removeListener('close', onClose);
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onData = (chunk: Buffer): void => {
        size += chunk.length;
        if (size > limitBytes) {
          response.destroy();
          fail(new Error(overflowMessage));
          return;
        }
        chunks.push(chunk);
      };
      const onEnd = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      };
      const onError = (error: Error): void => fail(signal.aborted ? createAbortError() : error);
      const onClose = (): void => {
        if (response.readableEnded) {
          onEnd();
          return;
        }
        fail(signal.aborted ? createAbortError() : new Error('更新服务在返回完整内容前关闭了连接'));
      };

      response.on('data', onData);
      response.on('end', onEnd);
      response.on('error', onError);
      response.on('close', onClose);
    });
  }
}
