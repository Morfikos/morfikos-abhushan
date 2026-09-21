"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { XClose } from "@untitledui/icons";

import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

type ToastKind = "success" | "error";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type StaffToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const StaffToastContext = createContext<StaffToastApi | null>(null);

const AUTO_DISMISS_MS = 4_000;

export function useStaffToast(): StaffToastApi {
  const api = useContext(StaffToastContext);
  if (!api) {
    throw new Error("useStaffToast must be used inside StaffToastProvider.");
  }
  return api;
}

export function StaffToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((current) => [...current.slice(-4), { id, kind, message }]);
  }, []);

  const api = useMemo<StaffToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <StaffToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-80 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </StaffToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-primary px-4 py-3 shadow-lg ring-1 ring-secondary",
        item.kind === "success" ? "text-success-primary" : "text-error-primary",
      )}
    >
      <p className="min-w-0 flex-1 text-sm font-medium text-primary">{item.message}</p>
      <Button
        color="tertiary"
        size="sm"
        iconLeading={XClose}
        aria-label="Dismiss"
        className="shrink-0"
        onPress={onDismiss}
      />
    </div>
  );
}
