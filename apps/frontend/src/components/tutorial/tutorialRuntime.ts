import type {
  ExecutionSnapshot,
  ExecutionStartRequest,
  UserSettings,
  RuntimeDeviceStatusEnvelope,
} from "@zahnerflow/types";
import {
  type TutorialTransport,
} from "../../tutorialEnvironment";
import {
  RUNTIME_CONNECTED,
  WORKFLOW_SNAPSHOT,
  WORKFLOW_NODES_RESET,
  WORKFLOW_NODE_STATUS,
  DEVICE_STATUS_UPDATE,
} from "../../eventContracts";
import scenario from "./tutorialScenario.json";
import deviceScenario from "./tutorialDeviceScenario.json";

/** Recorded from the project's Python simulator; no UI or execution planner lives here. */
export class TutorialRuntime implements TutorialTransport {
  constructor(readonly lessonId: string) {
    if (lessonId === "prepare") {
      this.settings.filePath.projectName = "";
      this.settings.filePath.individualName = "";
    }
  }
  connected = false;
  paused = false;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();
  private sequence = 0;
  private timers: number[] = [];
  private snapshot = scenario.idle as ExecutionSnapshot;
  private users = structuredClone(scenario.users.users);
  private settings = structuredClone(
    scenario.settings.settings,
  ) as UserSettings;
  private requestBody: ExecutionStartRequest | null = null;
  private elapsed = 0;
  private playbackStartedAt = 0;
  private deviceStates: Record<string, RuntimeDeviceStatusEnvelope> = {
    furnace: structuredClone(scenario.furnace) as RuntimeDeviceStatusEnvelope,
    mfc: structuredClone(scenario.mfc) as RuntimeDeviceStatusEnvelope,
  };
  private deviceSequence = 0;
  private deviceTimeOffset = Date.now() - Date.parse(deviceScenario.furnace.connect.status.timestamp);
  private replayDevice(record: { response: unknown; status: unknown }) {
    // Business controls consume simulator recordings through the usual status event.
    // Versions are session-local so replay/rescan never goes backwards.
    const status = JSON.parse(JSON.stringify(record.status), (_key, value) =>
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
        ? new Date(Date.parse(value) + this.deviceTimeOffset).toISOString() : value,
    ) as RuntimeDeviceStatusEnvelope;
    status.stateVersion = ++this.deviceSequence;
    if (status.runtimeState) status.runtimeState.stateVersion = status.stateVersion;
    this.deviceStates[status.device] = status;
    this.dispatch(DEVICE_STATUS_UPDATE, status);
    const response = structuredClone(record.response);
    if (response && typeof response === "object" && "runtimeStatus" in response)
      response.runtimeStatus = status;
    return response;
  }

  on(event: string, handler: (payload: unknown) => void) {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
    if (event === RUNTIME_CONNECTED || event === "connect") {
      queueMicrotask(() =>
        handler(event === "connect" ? undefined : { runtimeId: "tutorial" }),
      );
    }
    if (event === WORKFLOW_SNAPSHOT)
      queueMicrotask(() => this.publishSnapshot(this.snapshot));
    return () => {
      handlers.delete(handler);
    };
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
    this.clearTimers();
  }
  emit(_event: string, _payload?: unknown) {
    /* Rooms are unnecessary in an isolated session. */
  }
  private dispatch(event: string, payload: unknown) {
    this.listeners
      .get(event)
      ?.forEach((handler) => handler(structuredClone(payload)));
  }
  private clearTimers() {
    this.timers.forEach(window.clearInterval);
    this.timers = [];
  }
  private normalize<T>(payload: T): T {
    const serialized = JSON.stringify(payload).replaceAll(
      scenario.final.executionId,
      "tutorial-execution",
    );
    const offset =
      this.playbackStartedAt - Date.parse(scenario.final.startTime);
    const value = JSON.parse(serialized, (_key, item) =>
      typeof item === "string" &&
      /^\d{4}-\d{2}-\d{2}T/.test(item) &&
      this.playbackStartedAt
        ? new Date(Date.parse(item) + offset).toISOString()
        : item,
    );
    if (value.executionId) value.executionId = "tutorial-execution";
    return value;
  }
  private publishSnapshot(source: ExecutionSnapshot) {
    this.snapshot = {
      ...this.normalize(source),
      runtimeId: "tutorial",
      snapshotSequence: ++this.sequence,
    };
    if (source.status !== "idle" && this.requestBody) {
      this.snapshot.nodes = this.requestBody.nodes;
      this.snapshot.workflowName = this.requestBody.workflowName;
      this.snapshot.ownerName = this.requestBody.ownerName;
    }
    this.dispatch(WORKFLOW_SNAPSHOT, this.snapshot);
  }
  private startPlayback() {
    this.clearTimers();
    this.elapsed = 0;
    this.playbackStartedAt = Date.now();
    const trace = scenario.events.filter(
      (event) =>
        event.name !== RUNTIME_CONNECTED &&
        !(event.name === WORKFLOW_SNAPSHOT && event.payload.status === "idle"),
    );
    const measurementEnd = trace.findIndex(
      (event) =>
        event.name === WORKFLOW_NODE_STATUS &&
        event.payload.nodeId === scenario.final.nodes[0].id &&
        event.payload.status === "completed",
    );
    const events =
      this.lessonId === "stop"
        ? trace.slice(0, measurementEnd)
        : trace;
    let next = 0;
    const timer = window.setInterval(() => {
      if (this.paused) return;
      this.elapsed += 50;
      while (next < events.length && this.elapsed >= 100 + next * 650) {
        const event = events[next++];
        if (event.name === WORKFLOW_SNAPSHOT)
          this.publishSnapshot(event.payload as ExecutionSnapshot);
        else this.dispatch(event.name, this.normalize(event.payload));
      }
      if (next === events.length) window.clearInterval(timer);
    }, 50);
    this.timers.push(timer);
  }
  async request(
    method: string,
    endpoint: string,
    body: unknown,
    livePlan: () => Promise<unknown>,
  ): Promise<unknown> {
    // These two endpoints only compile/read a plan. They do not execute, save, or connect devices.
    if (
      method === "POST" &&
      ["/api/executions/unroll-preview", "/api/executions/estimate"].includes(
        endpoint,
      )
    )
      return livePlan();
    if (method === "GET" && endpoint === "/api/runtime/snapshot")
      return this.snapshot;
    if (endpoint === "/api/users" && method === "GET")
      return { users: structuredClone(this.users) };
    if (endpoint === "/api/users" && method === "POST") {
      const user = {
        ...this.users[0],
        id: "tutorial-new-user",
        user: (body as { user: string }).user,
      };
      this.users.push(user);
      return { success: true, message: "创建成功", user };
    }
    if (/^\/api\/users\/[^/]+\/settings$/.test(endpoint)) {
      if (method === "PUT")
        this.settings = structuredClone(body) as UserSettings;
      return { success: true, settings: structuredClone(this.settings) };
    }
    if (method === "GET" && endpoint === "/api/files/projects")
      return { success: true, projects: ["Tutorial"] };
    if (method === "GET" && endpoint.endsWith("/runtime/status")) {
      const device = endpoint.split("/")[3] as
        "mfc" | "furnace" | "zahner-zennium";
      return structuredClone(this.deviceStates[device] ?? scenario[device]);
    }
    if (method === "GET" && endpoint.endsWith("/command-logs"))
      return { logs: [] };
    if (method === "GET" && endpoint === "/api/devices/furnace/presets")
      return [];
    if (method === "GET" && /^\/api\/devices\/(furnace|mfc)\/ports$/.test(endpoint))
      return ["COM_SIMULATOR"];
    if (method === "GET" && endpoint === "/api/devices/furnace/program/segments")
      return structuredClone(deviceScenario.furnace.segments);
    if (method === "GET" && /\/(activity-summary|samples|logs\/temperature)$/.test(endpoint))
      return [];
    if (method === "GET" && endpoint === "/api/devices/mfc/logs/flow")
      return { samples: [] };
    if (method === "POST" && this.lessonId === "furnace-control") {
      const command = endpoint.replace("/api/devices/furnace/", "");
      if (["connect", "run", "pause", "stop", "disconnect"].includes(command)) {
        const key = command === "run" && this.deviceStates.furnace.runtimeState?.executionStatus === "paused" ? "resume" : command;
        return this.replayDevice(deviceScenario.furnace[key as "connect" | "run" | "pause" | "resume" | "stop" | "disconnect"]);
      }
    }
    if (method === "POST" && this.lessonId === "mfc-control") {
      const command = endpoint.replace("/api/devices/mfc/", "");
      if (command === "connect" || command === "disconnect")
        return this.replayDevice(deviceScenario.mfc[command]);
      if (command === "scan") {
        const { address } = body as { address: number };
        const record = (deviceScenario.mfc.scan as Record<string, { response: unknown; status: unknown }>)[address];
        if (record) {
          await new Promise(resolve => window.setTimeout(resolve, 35));
          return this.replayDevice(record);
        }
      }
      if (command === "setpoint") {
        const { address, sccm } = body as { address: number; sccm: number };
        if (address === 32 && (sccm === 0 || sccm === 50))
          return this.replayDevice(deviceScenario.mfc[sccm === 50 ? "flow50" : "flow0"]);
      }
    }
    if (method === "POST" && endpoint === "/api/executions") {
      this.requestBody = structuredClone(body) as ExecutionStartRequest;
      const missing = [
        !this.requestBody.ownerName?.trim() && "ownerName",
        !this.requestBody.pathConfig?.projectName?.trim() && "projectName",
        !this.requestBody.pathConfig?.individualName?.trim() && "individualName",
      ].filter(Boolean);
      if (missing.length && !this.requestBody.forceStartWithMissingRunMetadata) {
        const detail = Object.values(deviceScenario.metadata).find(item =>
          JSON.stringify(item.missingFields) === JSON.stringify(missing));
        if (!detail) throw new Error("未采集的教学信息缺失组合");
        throw Object.assign(new Error(detail.message), { code: "HTTP_409", status: 409, details: structuredClone(detail) });
      }
      if (
        this.requestBody.nodes?.length !== 1 ||
        this.requestBody.nodes[0].type !== "ocp_measurement"
      )
        throw new Error("此教学片段使用单个开路电位示例");
      this.startPlayback();
      return {
        executionId: "tutorial-execution",
        workflowId: scenario.final.workflowId,
        status: "running",
      };
    }
    if (
      method === "DELETE" &&
      endpoint === "/api/executions/tutorial-execution"
    ) {
      this.clearTimers();
      this.publishSnapshot(
        scenario.cancelEvents[0].payload as ExecutionSnapshot,
      );
      const timer = window.setInterval(() => {
        if (this.paused) return;
        window.clearInterval(timer);
        this.publishSnapshot(
          scenario.cancelEvents.at(-1)!.payload as ExecutionSnapshot,
        );
        for (const notification of scenario.cancelNotifications)
          this.dispatch(
            notification.name,
            this.normalize(notification.payload),
          );
      }, 1200);
      this.timers.push(timer);
      return { message: "已请求停止" };
    }
    if (method === "POST" && endpoint === "/api/executions/reset") {
      this.clearTimers();
      this.requestBody = null;
      this.dispatch(WORKFLOW_NODES_RESET, {
        targetStatus: "idle",
        timestamp: new Date().toISOString(),
      });
      this.publishSnapshot(scenario.idle as ExecutionSnapshot);
      return {
        success: true,
        message: "已重置",
        timestamp: new Date().toISOString(),
      };
    }
    if (method === "GET" && endpoint === "/api/workflows/summaries")
      return structuredClone(scenario.summaries);
    if (
      method === "GET" &&
      endpoint === `/api/workflows/${scenario.definition.id}`
    )
      return structuredClone(scenario.definition);
    if (
      method === "GET" &&
      /^\/api\/workflows\/[^/]+\/definition$/.test(endpoint)
    )
      return structuredClone(scenario.definition);
    if (
      method === "GET" &&
      /^\/api\/workflows\/[^/]+\/executions$/.test(endpoint)
    )
      return structuredClone(scenario.executions);
    if (method === "GET" && /^\/api\/executions\/[^/]+\/report$/.test(endpoint))
      return structuredClone(scenario.report);
    throw new Error(`教学数据不包含此操作：${method} ${endpoint}`);
  }
}
