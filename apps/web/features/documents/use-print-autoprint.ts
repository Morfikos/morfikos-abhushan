"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * When `?autoprint=1` is present and `enabled`, open the system print dialog once,
 * then strip the query param so refresh does not reprint.
 */
export function usePrintAutoprint(enabled: boolean): void {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const firedRef = useRef(false);
  const shouldAutoprint = searchParams.get("autoprint") === "1";

  useEffect(() => {
    if (!enabled || !shouldAutoprint || firedRef.current) {
      return;
    }
    firedRef.current = true;

    const frame = window.requestAnimationFrame(() => {
      window.print();
      const next = new URLSearchParams(searchParams.toString());
      next.delete("autoprint");
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      window.history.replaceState({}, "", url);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [enabled, shouldAutoprint, pathname, searchParams]);
}
