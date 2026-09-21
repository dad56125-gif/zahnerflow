/** In-place workspace data boundary; business controls retain their normal behavior. */
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

let storage: Storage = window.localStorage;
// Keep this object stable: Zustand captures it once when stores are created.
export const appStorage: Storage = {
  get length() { return storage.length; },
  key: index => storage.key(index),
  getItem: key => storage.getItem(key),
  setItem: (key, value) => storage.setItem(key, value),
  removeItem: key => storage.removeItem(key),
  clear: () => storage.clear(),
};
export let workspaceGeneration = 0;
export function enterTutorialStorage() {
  ++workspaceGeneration;
  const previous = storage;
  storage = new MemoryStorage();
  return () => { ++workspaceGeneration; storage = previous; };
}
export let tutorialTransport: TutorialTransport | null = null;
const transportListeners = new Set<() => void>();
export function onTutorialTransportChange(listener: () => void) {
  transportListeners.add(listener);
  return () => { transportListeners.delete(listener); };
}
export function setTutorialTransport(transport: TutorialTransport | null) {
  tutorialTransport = transport;
  transportListeners.forEach(listener => listener());
}
// Session boundaries preserve mounted UI subscribers; only their data source changes.
type SessionParticipant = (lessonId: string) => () => void;
const participants = new Set<SessionParticipant>();
export function registerWorkspaceParticipant(participant: SessionParticipant) {
  participants.add(participant);
  return () => { participants.delete(participant); };
}
export function enterWorkspaceParticipants(lessonId: string) {
  const restore = [...participants].map(participant => participant(lessonId));
  return () => { restore.reverse().forEach(leave => leave()); };
}

// Debounced edits already made by the user must finish before changing workspaces.
const pendingWorkspaceEdits = new Set<Promise<void>>();
export function trackWorkspaceEdit(pending: Promise<void>) {
  pendingWorkspaceEdits.add(pending);
  void pending.finally(() => pendingWorkspaceEdits.delete(pending));
}
export async function settleWorkspaceEdits() {
  while (pendingWorkspaceEdits.size) await Promise.allSettled([...pendingWorkspaceEdits]);
}
