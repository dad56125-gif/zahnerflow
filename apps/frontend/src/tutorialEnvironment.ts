/** Bootstrap boundary. Business components never branch on teaching state. */
export interface TutorialTransport {
  request(
    method: string,
    endpoint: string,
    body: unknown,
    livePlan: () => Promise<unknown>,
  ): Promise<unknown>;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  emit(event: string, payload?: unknown): void;
  readonly connected: boolean;
}

const query = new URLSearchParams(window.location.search);
// Only the application's embedded player can create a teaching environment.
export const tutorialContext =
  window.parent !== window && query.has("tutorial")
    ? {
        lessonId: query.get("tutorial")!,
        preview: query.get("preview") === "1",
      }
    : null;

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

export const appStorage: Storage = tutorialContext
  ? new MemoryStorage()
  : window.localStorage;
export let tutorialTransport: TutorialTransport | null = null;
export function installTutorialTransport(transport: TutorialTransport) {
  if (!tutorialContext || tutorialTransport)
    throw new Error("教学环境只能在启动前安装一次");
  tutorialTransport = transport;
}
