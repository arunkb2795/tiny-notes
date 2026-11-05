export function NotesSkeleton({ kind }: { kind: "list" | "editor" }) {
  return (
    <div
      role="status"
      aria-label={kind === "list" ? "Loading notes" : "Loading editor"}
      className="space-y-5 motion-safe:animate-pulse"
    >
      <span className="sr-only">{kind === "list" ? "Loading notes…" : "Loading editor…"}</span>
      <div aria-hidden="true" className="h-11 w-40 rounded-lg bg-foreground/10" />
      {kind === "list" ? (
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-40 rounded-xl border border-foreground/15 bg-foreground/5"
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="space-y-5">
          <div className="h-20 rounded-xl bg-foreground/5" />
          <div className="h-28 rounded-xl border border-foreground/15 bg-foreground/5" />
          <div className="min-h-[55vh] rounded-2xl border border-foreground/20 bg-foreground/5" />
        </div>
      )}
    </div>
  );
}
