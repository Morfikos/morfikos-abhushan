"use client";

import { useEffect, type ReactNode, type RefObject } from "react";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export type FormDialogProps = {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmColor?: "primary" | "primary-destructive";
  cancelLabel?: string;
  isConfirming?: boolean;
  isConfirmDisabled?: boolean;
  error?: ReactNode;
  /** Focus this element when the dialog opens (e.g. reason field). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  /** Overrides the default `max-w-md` modal width. */
  modalClassName?: string;
};

export function FormDialog({
  isOpen,
  title,
  children,
  confirmLabel,
  confirmColor = "primary",
  cancelLabel = "Cancel",
  isConfirming = false,
  isConfirmDisabled = false,
  error,
  initialFocusRef,
  onConfirm,
  onCancel,
  className,
  modalClassName,
}: FormDialogProps) {
  useEffect(() => {
    if (!isOpen || !initialFocusRef?.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [initialFocusRef, isOpen]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onCancel();
        }
      }}
      isDismissable={!isConfirming}
    >
      <Modal className={cx("w-full max-w-md", modalClassName)}>
        <Dialog className={cx("relative flex w-full flex-col overflow-hidden rounded-2xl bg-primary shadow-xl outline-hidden", className)}>
          <div className="flex flex-col gap-4 p-6">
            <Heading slot="title" className="shrink-0 text-lg font-semibold text-primary">
              {title}
            </Heading>
            <div className="flex max-h-[min(60vh,28rem)] flex-col gap-4 overflow-y-auto text-left">{children}</div>
            {error ? (
              <div role="alert" className="shrink-0 text-sm text-error-primary">
                {error}
              </div>
            ) : null}
            <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                color="secondary"
                size="md"
                className="w-full sm:w-auto"
                isDisabled={isConfirming}
                onPress={onCancel}
              >
                {cancelLabel}
              </Button>
              <Button
                color={confirmColor}
                size="md"
                className="w-full sm:w-auto"
                isLoading={isConfirming}
                isDisabled={isConfirming || isConfirmDisabled}
                onPress={onConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
