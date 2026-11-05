import { NoteFailure } from "./note-content";
import type { NoteIdentity, NoteResult } from "./note-types";

export async function runNoteMutation<T>(
  input: NoteIdentity,
  getAccount: () => Promise<string | null>,
  allowWrite: (userId: string) => boolean,
  operation: (userId: string) => T,
): Promise<NoteResult<T>> {
  try {
    const userId = await getAccount();
    if (!userId || userId !== input?.accountId)
      throw new NoteFailure(
        "UNAUTHENTICATED",
        "Your session changed or expired. Sign in to the original account in another tab, then retry.",
      );
    if (!allowWrite(userId))
      throw new NoteFailure("RATE_LIMITED", "Too many changes. Please wait a minute and retry.");
    if (
      typeof input.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    )
      throw new NoteFailure("VALIDATION_ERROR", "Invalid note identifier.");
    return { ok: true, data: operation(userId) };
  } catch (error) {
    if (error instanceof NoteFailure)
      return { ok: false, error: { code: error.code, message: error.message } };
    const requestId = crypto.randomUUID();
    console.error({ requestId, operation: "note-mutation", category: "NOTE_INTERNAL_ERROR" });
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
      requestId,
    };
  }
}
