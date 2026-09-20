"use client";

import type { ReactNode } from "react";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isConfirming = false,
  onConfirm,
  onCancel,
  className,
}: ConfirmDialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onCancel();
        }
      }}
      isDismissable={!isConfirming}
      className={(state) =>
        cx(
          "fixed inset-0 z-50 flex min-h-dvh w-full items-end justify-center overflow-y-auto bg-overlay/70 px-4 py-8 outline-hidden backdrop-blur-[6px] sm:items-center sm:justify-center sm:p-8",
          state.isEntering && "duration-300 ease-out animate-in fade-in",
          state.isExiting && "duration-200 ease-in animate-out fade-out",
        )
      }
    >
      <Modal className="w-full max-w-md">
        <Dialog
          role="alertdialog"
          className={cx("relative w-full overflow-hidden rounded-2xl bg-primary p-6 shadow-xl outline-hidden", className)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Heading slot="title" className="text-lg font-semibold text-primary">
                {title}
              </Heading>
              <div className="text-sm text-tertiary">{message}</div>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button color="secondary" size="md" isDisabled={isConfirming} onPress={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                color="primary-destructive"
                size="md"
                isLoading={isConfirming}
                isDisabled={isConfirming}
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
