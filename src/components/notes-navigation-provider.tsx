"use client";

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { NotesNavigation } from "@/src/lib/notes-navigation";

const NavigationContext = createContext<NotesNavigation | null>(null);
export function useNotesNavigation(): NotesNavigation {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Notes navigation provider is missing.");
  return navigation;
}
function NavigationCompletion() {
  const navigation = useNotesNavigation();
  const path = usePathname();
  useEffect(() => {
    navigation.complete(path);
  }, [navigation, path]);
  return null;
}
export function NotesNavigationProvider({ children }: { children: ReactNode }) {
  const [navigation] = useState(() => new NotesNavigation());
  const state = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  function handleDiscard(): void {
    if (window.confirm("Discard your unsaved changes and leave? This cannot be undone.")) {
      void navigation.discard();
    }
  }
  return (
    <NavigationContext value={navigation}>
      <Suspense fallback={null}>
        <NavigationCompletion />
      </Suspense>
      {children}
      {state.phase !== "idle" && (
        <div className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-xl rounded-xl border border-foreground/25 bg-background p-4 shadow-lg">
          <p role={state.phase === "failed" ? "alert" : "status"} aria-live="polite">
            {state.message}
          </p>
          <div className="mt-3 flex gap-2">
            {state.phase !== "navigating" && (
              <button type="button" className="note-button" onClick={navigation.cancel}>
                Stay here
              </button>
            )}
            {state.phase === "failed" && (
              <button type="button" className="note-button" onClick={handleDiscard}>
                Discard and leave
              </button>
            )}
          </div>
        </div>
      )}
    </NavigationContext>
  );
}
