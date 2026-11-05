import { expect, spyOn, test } from "bun:test";
import { runNoteMutation } from "./note-mutation";
import { NoteFailure } from "./note-content";

test("mutation boundary rejects expired/swapped accounts and rate limits before writes", async () => {
  const identity = { id: crypto.randomUUID(), accountId: "alice" };
  let writes = 0;
  function write() {
    writes++;
    return null;
  }
  for (const userId of [null, "bob"]) {
    const result = await runNoteMutation(
      identity,
      async () => userId,
      () => true,
      write,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  }
  const limited = await runNoteMutation(
    identity,
    async () => "alice",
    () => false,
    write,
  );
  if (limited.ok) throw new Error("Expected rate limit");
  expect(limited.error.code).toBe("RATE_LIMITED");
  expect(writes).toBe(0);
  const success = await runNoteMutation(
    identity,
    async () => "alice",
    () => true,
    write,
  );
  expect(success.ok).toBe(true);
  expect(writes).toBe(1);
});

test("mutation errors preserve safe codes and correlate internal failures without SQL or secrets", async () => {
  const identity = { id: crypto.randomUUID(), accountId: "alice" };
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const missing = await runNoteMutation(
      identity,
      async () => "alice",
      () => true,
      () => {
        throw new NoteFailure("NOT_FOUND", "Note not found.");
      },
    );
    if (missing.ok) throw new Error("Expected not found");
    expect(missing.error.code).toBe("NOT_FOUND");
    const result = await runNoteMutation(
      identity,
      async () => "alice",
      () => true,
      () => {
        throw new Error("SQL SELECT secret FROM notes at C:/private/database.sqlite");
      },
    );
    if (result.ok) throw new Error("Expected failure");
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.requestId).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/SELECT|sqlite|private|stack/);
    expect(log).toHaveBeenCalledWith({
      requestId: result.requestId,
      operation: "note-mutation",
      category: "NOTE_INTERNAL_ERROR",
    });
  } finally {
    log.mockRestore();
  }
});
