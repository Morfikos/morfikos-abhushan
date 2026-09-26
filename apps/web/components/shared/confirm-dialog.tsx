"use client";

import { useId, type ReactNode } from "react";
import { Heading, Text } from "react-aria-components";
import { AlertCircle } from "@untitledui/icons";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  confirmColor?: "primary" | "primary-destructive";
  cancelLabel?: string;
  isConfirming?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
  /** Overrides the default `max-w-md` modal width. */
  modalClassName?: string;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmColor = "primary-destructive",
  cancelLabel = "Cancel",
  isConfirming = false,
  error,
  onConfirm,
  onCancel,
  className,
  modalClassName,
}: ConfirmDialogProps) {
  const descriptionId = useId();
  const isDestructive = confirmColor === "primary-destructive";
  const messageIsString = typeof message === "string";

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
        <Dialog
          role="alertdialog"
          aria-describedby={messageIsString ? undefined : descriptionId}
          className={cx("relative w-full overflow-hidden rounded-2xl bg-primary p-6 shadow-xl outline-hidden", className)}
        >
          <div className="flex flex-col gap-4">
            {isDestructive ? (
              <div className="flex size-10 items-center justify-center rounded-full bg-error-primary/10 ring-1 ring-error-secondary/30">
                <AlertCircle className="size-5 text-fg-error-primary" aria-hidden />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <Heading slot="title" className="text-lg font-semibold text-primary">
                {title}
              </Heading>
              {messageIsString ? (
                <Text slot="description" className="text-sm text-tertiary">
                  {message}
                </Text>
              ) : (
                <div id={descriptionId} className="text-sm text-tertiary">
                  {message}
                </div>
              )}
            </div>
            {error ? (
              <div role="alert" className="text-sm text-error-primary">
                {error}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button color="secondary" size="md" isDisabled={isConfirming} onPress={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                color={confirmColor}
                size="md"
                isLoading={isConfirming}
                isDisabled={isConfirming}
                autoFocus={!isDestructive}
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
