"use client";

import { useEffect } from "react";
import type { NoteAutosave } from "@/src/lib/note-autosave";
import { useNotesNavigation } from "./notes-navigation-provider";

export function useDraftGuard(controller: NoteAutosave): void {
  const coordinator = useNotesNavigation();
  useEffect(() => {
    controller.activate();
    const unregister = coordinator.register(controller);
    let discarded = false;
    const warning = "This note has unsaved changes. Leave and discard them?";
    function dirty(): boolean {
      const state = controller.getSnapshot();
      return !discarded && (state.dirty || state.saving);
    }
    function handleDiscard(): void {
      discarded = true;
    }
    function handleUnload(event: BeforeUnloadEvent): void {
      if (dirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    // Chromium's Navigation API also covers browser back/forward and programmatic navigation.
    function handleNavigate(event: Event): void {
      const navigationEvent = event as Event & { navigationType?: string };
      // Native replaceState updates the URL after creation without leaving the editor.
      if (navigationEvent.navigationType !== "traverse") return;
      if (event.cancelable && dirty() && !window.confirm(warning)) event.preventDefault();
    }
    const navigation =
      "navigation" in window && window.navigation instanceof EventTarget ? window.navigation : null;
    window.addEventListener("beforeunload", handleUnload);
    if (navigation) navigation.addEventListener("navigate", handleNavigate);
    window.addEventListener("tiny-notes:discard", handleDiscard);
    return () => {
      controller.dispose();
      unregister();
      window.removeEventListener("tiny-notes:discard", handleDiscard);
      window.removeEventListener("beforeunload", handleUnload);
      navigation?.removeEventListener("navigate", handleNavigate);
    };
  }, [controller, coordinator]);
}
