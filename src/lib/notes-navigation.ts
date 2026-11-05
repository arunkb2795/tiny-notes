import type { NoteAutosave } from "./note-autosave";

type Intent = () => void | Promise<void>;
type NavigationState = { phase: "idle" | "saving" | "navigating" | "failed"; message: string };

// One navigation intent at a time; cancelling an intent never cancels a submitted save.
export class NotesNavigation {
  private controller: NoteAutosave | null = null;
  private intent: Intent | null = null;
  private destination: string | null = null;
  private version = 0;
  private state: NavigationState = { phase: "idle", message: "" };
  private listeners = new Set<() => void>();
  getSnapshot = (): NavigationState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: NavigationState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  register(controller: NoteAutosave): () => void {
    this.controller = controller;
    return () => {
      if (this.controller === controller) {
        this.controller = null;
        this.cancel();
      }
    };
  }
  needsSave(): boolean {
    const state = this.controller?.getSnapshot();
    return Boolean(state && (state.dirty || state.saving || state.error));
  }
  isBusy(): boolean {
    return this.state.phase === "saving" || this.state.phase === "navigating";
  }
  async request(intent: Intent, destination: string | null = null): Promise<void> {
    if (this.isBusy()) return;
    const version = ++this.version;
    this.intent = intent;
    this.destination = destination;
    this.publish({ phase: "saving", message: "Saving before leaving…" });
    try {
      const result = await this.controller?.prepareForNavigation();
      if (version !== this.version) return;
      if (result && !result.ready) {
        this.publish({ phase: "failed", message: result.message });
        return;
      }
      this.publish({ phase: "navigating", message: "Opening page…" });
      await intent();
    } catch {
      if (version === this.version)
        this.publish({
          phase: "failed",
          message: "Couldn't leave this page. Your draft is still here. Please try again.",
        });
    }
  }
  cancel = (): void => {
    this.version++;
    this.intent = null;
    this.destination = null;
    this.publish({ phase: "idle", message: "" });
  };
  complete = (path?: string): void => {
    if (this.state.phase === "navigating" && (!this.destination || this.destination === path))
      this.cancel();
  };
  async discard(): Promise<void> {
    if (this.state.phase !== "failed" || !this.intent) return;
    const intent = this.intent;
    this.publish({ phase: "navigating", message: "Opening page…" });
    try {
      await intent();
    } catch {
      this.publish({ phase: "failed", message: "Couldn't leave this page. Please try again." });
    }
  }
}
