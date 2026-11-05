import type { NoteDraft, NoteResult, SaveNoteInput, SavedNote } from "./note-types";

type Transport = (input: SaveNoteInput, creating: boolean) => Promise<NoteResult<SavedNote>>;
export type NavigationReadiness = { ready: true } | { ready: false; message: string };
type Snapshot = {
  draft: NoteDraft;
  saved: SavedNote | null;
  saving: boolean;
  dirty: boolean;
  paused: boolean;
  error: { code: string; message: string } | null;
};
function fingerprint(draft: NoteDraft): string {
  return JSON.stringify({ title: draft.title.trim(), content: draft.content });
}

// Event-driven save queue. React subscribes to snapshots; no effects synchronize editor content.
export class NoteAutosave {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private acknowledged: string;
  private active: Promise<void> | null = null;
  private disposed = false;
  constructor(
    private identity: { id: string; accountId: string },
    draft: NoteDraft,
    saved: SavedNote | null,
    private transport: Transport,
    private onCreated: (id: string) => void,
  ) {
    this.acknowledged = saved ? fingerprint(saved) : "";
    this.snapshot = { draft, saved, saving: false, dirty: false, paused: false, error: null };
  }
  getSnapshot = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  edit(draft: NoteDraft): void {
    const dirty = fingerprint(draft) !== this.acknowledged;
    const error = this.snapshot.error;
    this.publish({
      draft,
      dirty,
      error:
        error?.code === "VALIDATION_ERROR" || error?.code === "CONTENT_TOO_LARGE" ? null : error,
    });
    clearTimeout(this.timer);
    if (dirty && !this.snapshot.paused && !this.snapshot.error && !this.disposed)
      this.timer = setTimeout(() => {
        void this.flush();
      }, 800);
  }
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.active) return this.active;
    if (this.disposed || this.snapshot.paused || !this.snapshot.dirty || this.snapshot.error)
      return Promise.resolve();
    if (!this.snapshot.draft.title.trim() || this.snapshot.draft.title.trim().length > 120) {
      this.publish({
        error: {
          code: "VALIDATION_ERROR",
          message: "Enter a title of 1–120 characters to save this draft.",
        },
      });
      return Promise.resolve();
    }
    this.active = this.save().finally(() => {
      this.active = null;
    });
    return this.active;
  };
  private async save(): Promise<void> {
    this.publish({ saving: true });
    while (this.snapshot.dirty && !this.snapshot.paused && !this.disposed) {
      const sent = this.snapshot.draft;
      const creating = !this.snapshot.saved;
      try {
        const result = await this.transport(
          { ...this.identity, ...sent, revision: this.snapshot.saved?.revision },
          creating,
        );
        if (!result.ok) {
          this.publish({ error: result.error, saving: false });
          return;
        }
        this.acknowledged = fingerprint(result.data);
        this.publish({
          saved: result.data,
          dirty: fingerprint(this.snapshot.draft) !== this.acknowledged,
          error: null,
        });
        if (creating) this.onCreated(result.data.id);
      } catch {
        this.publish({
          saving: false,
          error: {
            code: "NETWORK_ERROR",
            message: "Offline / Couldn't save. Your draft is still here.",
          },
        });
        return;
      }
    }
    this.publish({ saving: false });
  }
  saveNow = (): Promise<void> => {
    // Manual save/retry shares the same queue and cannot overwrite a conflict.
    if (this.snapshot.error?.code === "CONFLICT") return Promise.resolve();
    this.publish({ error: null });
    return this.flush();
  };
  retry = (): void => {
    void this.saveNow();
  };
  async prepareForNavigation(): Promise<NavigationReadiness> {
    if (this.disposed || this.snapshot.paused)
      return {
        ready: false,
        message: "This editor is not ready to leave. Please stay here and try again.",
      };
    await this.flush();
    const state = this.snapshot;
    if (state.error || state.dirty || state.saving)
      return {
        ready: false,
        message:
          state.error?.message ??
          "Your latest changes have not been saved. Please retry or discard them before leaving.",
      };
    return { ready: true };
  }
  async pause(): Promise<void> {
    clearTimeout(this.timer);
    this.publish({ paused: true });
    await this.active;
  }
  resume(): void {
    this.publish({ paused: false });
    void this.flush();
  }
  activate(): void {
    this.disposed = false;
  }
  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
