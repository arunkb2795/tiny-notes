import { afterEach, describe, expect, test } from "bun:test";
import { NoteAutosave } from "./note-autosave";
import { emptyContent } from "./note-content";
import type { NoteResult, SaveNoteInput, SavedNote } from "./note-types";

const controllers: NoteAutosave[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});
const initial: SavedNote = {
  id: crypto.randomUUID(),
  title: "Initial",
  content: emptyContent,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  transport: (input: SaveNoteInput, creating: boolean) => Promise<NoteResult<SavedNote>>,
  saved: SavedNote | null = initial,
) {
  const created: string[] = [];
  const controller = new NoteAutosave(
    { id: initial.id, accountId: "alice" },
    saved ?? { title: "", content: emptyContent },
    saved,
    transport,
    (id) => created.push(id),
  );
  controllers.push(controller);
  return { controller, created };
}
function success(input: SaveNoteInput, revision = 2): NoteResult<SavedNote> {
  return { ok: true, data: { ...initial, ...input, title: input.title.trim(), revision } };
}

describe("autosave queue", () => {
  test("manual Save immediately persists a new note once and does not duplicate a concurrent save", async () => {
    const response = deferred<NoteResult<SavedNote>>();
    const calls: SaveNoteInput[] = [];
    const { controller } = setup(async (input, creating) => {
      expect(creating).toBe(true);
      calls.push(input);
      return response.promise;
    }, null);
    controller.edit({ title: "Manual save", content: emptyContent });
    const first = controller.saveNow();
    const second = controller.saveNow();
    expect(calls).toHaveLength(1);
    expect(first).toBe(second);
    response.resolve(success(calls[0] ?? { ...initial, accountId: "alice" }, 1));
    await first;
    expect(controller.getSnapshot().dirty).toBe(false);
    await controller.saveNow();
    expect(calls).toHaveLength(1);
  });
  test("manual Save validates titles and cannot override conflicts", async () => {
    let calls = 0;
    const { controller } = setup(async () => {
      calls++;
      return { ok: false, error: { code: "CONFLICT", message: "Keep draft" } };
    });
    controller.edit({ title: " ", content: emptyContent });
    await controller.saveNow();
    expect(calls).toBe(0);
    controller.edit({ title: "Changed", content: emptyContent });
    await controller.saveNow();
    await controller.saveNow();
    expect(calls).toBe(1);
    expect(controller.getSnapshot().dirty).toBe(true);
  });
  test("debounces and acknowledges the latest title", async () => {
    const calls: SaveNoteInput[] = [];
    const { controller } = setup(async (input) => {
      calls.push(input);
      return success(input);
    });
    controller.edit({ title: "First", content: emptyContent });
    controller.edit({ title: "Latest", content: emptyContent });
    expect(calls).toHaveLength(0);
    await Bun.sleep(850);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.title).toBe("Latest");
    expect(controller.getSnapshot().dirty).toBe(false);
  });
  test("blur flush and slow responses serialize newer edits using the acknowledged revision", async () => {
    const first = deferred<NoteResult<SavedNote>>();
    const calls: SaveNoteInput[] = [];
    const { controller } = setup(async (input) => {
      calls.push(input);
      return calls.length === 1 ? first.promise : success(input, 3);
    });
    controller.edit({ title: "First", content: emptyContent });
    const pending = controller.flush();
    controller.edit({ title: "Latest", content: emptyContent });
    void controller.flush();
    expect(calls).toHaveLength(1);
    expect(controller.getSnapshot().saving).toBe(true);
    first.resolve(success(calls[0] ?? { ...initial, accountId: "alice" }, 2));
    await pending;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.revision).toBe(2);
    expect(controller.getSnapshot().draft.title).toBe("Latest");
    expect(controller.getSnapshot().dirty).toBe(false);
  });
  test("new drafts require a title; retries reuse creation identity after a lost response", async () => {
    const calls: SaveNoteInput[] = [];
    const { controller, created } = setup(async (input) => {
      calls.push(input);
      if (calls.length === 1) throw new Error("network");
      return success(input, 1);
    }, null);
    controller.edit({ title: "", content: emptyContent });
    await controller.flush();
    expect(calls).toHaveLength(0);
    controller.edit({ title: "Created", content: emptyContent });
    await controller.flush();
    expect(controller.getSnapshot().dirty).toBe(true);
    expect(controller.getSnapshot().saved).toBeNull();
    controller.retry();
    await controller.flush();
    expect(calls[0]?.id).toBe(calls[1]?.id);
    expect(created).toEqual([initial.id]);
    expect(controller.getSnapshot().dirty).toBe(false);
  });
  test("conflicts and expired sessions keep drafts and stop automatic writes", async () => {
    for (const code of ["CONFLICT", "UNAUTHENTICATED"] as const) {
      let calls = 0;
      const { controller } = setup(async () => {
        calls++;
        return { ok: false, error: { code, message: "Draft retained" } };
      });
      controller.edit({ title: "Draft", content: emptyContent });
      await controller.flush();
      controller.edit({ title: "More edits", content: emptyContent });
      await controller.flush();
      expect(calls).toBe(1);
      expect(controller.getSnapshot().draft.title).toBe("More edits");
      expect(controller.getSnapshot().dirty).toBe(true);
    }
  });
  test("pause waits for in-flight acknowledgement and prevents queued saves during deletion", async () => {
    const response = deferred<NoteResult<SavedNote>>();
    let calls = 0;
    const { controller } = setup(async () => {
      calls++;
      return response.promise;
    });
    controller.edit({ title: "Saving", content: emptyContent });
    void controller.flush();
    controller.edit({ title: "Queued", content: emptyContent });
    const paused = controller.pause();
    response.resolve(success({ ...initial, title: "Saving", accountId: "alice" }));
    await paused;
    expect(calls).toBe(1);
    expect(controller.getSnapshot().paused).toBe(true);
    expect(controller.getSnapshot().draft.title).toBe("Queued");
  });
});
