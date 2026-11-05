import { afterEach, expect, test } from "bun:test";
import { NoteAutosave } from "./note-autosave";
import { NotesNavigation } from "./notes-navigation";
import { emptyContent } from "./note-content";
import type { NoteResult, SaveNoteInput, SavedNote } from "./note-types";

const controllers: NoteAutosave[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});
const note: SavedNote = {
  id: crypto.randomUUID(),
  title: "Saved",
  content: emptyContent,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
function success(input: SaveNoteInput): NoteResult<SavedNote> {
  return { ok: true, data: { ...note, ...input, revision: Number(input.revision ?? 0) + 1 } };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(
  transport: (input: SaveNoteInput) => Promise<NoteResult<SavedNote>>,
  initial: SavedNote | null = note,
) {
  const controller = new NoteAutosave(
    { id: note.id, accountId: "alice" },
    initial ?? { title: "", content: emptyContent },
    initial,
    transport,
    () => {},
  );
  controllers.push(controller);
  const navigation = new NotesNavigation();
  const unregister = navigation.register(controller);
  return { controller, navigation, unregister };
}
test("clean navigation performs no save and completion clears progress", async () => {
  let saves = 0;
  let opened = 0;
  const { navigation } = setup(async (input) => {
    saves++;
    return success(input);
  });
  expect(navigation.needsSave()).toBe(false);
  await navigation.request(() => {
    opened++;
  });
  expect(saves).toBe(0);
  expect(opened).toBe(1);
  expect(navigation.getSnapshot().phase).toBe("navigating");
  navigation.complete();
  expect(navigation.getSnapshot().phase).toBe("idle");
});
test("navigation waits for the latest queued edit and repeated clicks do not duplicate saves or departures", async () => {
  const response = deferred<NoteResult<SavedNote>>();
  const calls: SaveNoteInput[] = [];
  let opened = 0;
  const { controller, navigation } = setup(async (input) => {
    calls.push(input);
    return calls.length === 1 ? response.promise : success(input);
  });
  controller.edit({ title: "First", content: emptyContent });
  void controller.flush();
  controller.edit({ title: "Latest", content: emptyContent });
  const waiting = navigation.request(() => {
    opened++;
  });
  await navigation.request(() => {
    opened += 100;
  });
  expect(navigation.getSnapshot().phase).toBe("saving");
  expect(opened).toBe(0);
  response.resolve(success(calls[0] ?? { ...note, accountId: "alice" }));
  await waiting;
  expect(calls).toHaveLength(2);
  expect(calls[1]?.title).toBe("Latest");
  expect(calls[1]?.revision).toBe(2);
  expect(opened).toBe(1);
});
test("Stay here cancels departure while an already submitted save completes", async () => {
  const response = deferred<NoteResult<SavedNote>>();
  let opened = false;
  let sent: SaveNoteInput = { ...note, accountId: "alice" };
  const { controller, navigation } = setup(async (input) => {
    sent = input;
    return response.promise;
  });
  controller.edit({ title: "Keep", content: emptyContent });
  const pending = navigation.request(() => {
    opened = true;
  });
  navigation.cancel();
  response.resolve(success(sent));
  await pending;
  expect(opened).toBe(false);
  expect(controller.getSnapshot().dirty).toBe(false);
  expect(navigation.getSnapshot().phase).toBe("idle");
});
test("invalid new drafts stay in the editor and do not create a note", async () => {
  let saves = 0;
  let opened = false;
  const { controller, navigation } = setup(async (input) => {
    saves++;
    return success(input);
  }, null);
  controller.edit({ title: " ", content: emptyContent });
  await navigation.request(() => {
    opened = true;
  });
  expect(saves).toBe(0);
  expect(opened).toBe(false);
  expect(navigation.getSnapshot().phase).toBe("failed");
  expect(controller.getSnapshot().draft.title).toBe(" ");
});
test("network failure, conflict and expiry block navigation while preserving drafts; explicit discard can leave", async () => {
  for (const code of ["NETWORK_ERROR", "CONFLICT", "UNAUTHENTICATED"] as const) {
    let opened = 0;
    const { controller, navigation } = setup(async () => {
      if (code === "NETWORK_ERROR") throw new Error("offline");
      return { ok: false, error: { code, message: "Draft retained" } };
    });
    controller.edit({ title: "Keep draft", content: emptyContent });
    await navigation.request(() => {
      opened++;
    });
    expect(opened).toBe(0);
    expect(navigation.getSnapshot().phase).toBe("failed");
    expect(controller.getSnapshot().draft.title).toBe("Keep draft");
    await navigation.discard();
    expect(opened).toBe(1);
  }
});
test("unmounting an editor cancels a pending navigation intent", async () => {
  const response = deferred<NoteResult<SavedNote>>();
  let opened = false;
  const { controller, navigation, unregister } = setup(async () => response.promise);
  controller.edit({ title: "Draft", content: emptyContent });
  const pending = navigation.request(() => {
    opened = true;
  });
  unregister();
  response.resolve({ ok: true, data: { ...note, title: "Draft" } });
  await pending;
  expect(opened).toBe(false);
});
test("first-create URL replacement does not complete a navigation to the list", async () => {
  const { navigation } = setup(async (input) => success(input));
  await navigation.request(() => {}, "/notes");
  navigation.complete(`/notes/${note.id}`);
  expect(navigation.getSnapshot().phase).toBe("navigating");
  navigation.complete("/notes");
  expect(navigation.getSnapshot().phase).toBe("idle");
});
