"use client";

import { useEffect } from "react";

/** Blank `<title>` on print routes so Chromium header chrome does not show the app name. */
export function usePrintDocumentTitle(): void {
  useEffect(() => {
    const previous = document.title;
    document.title = " ";
    return () => {
      document.title = previous;
    };
  }, []);
}
