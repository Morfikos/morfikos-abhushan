"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GirviAccount, GirviCollateralItem } from "@aabhushan/contracts";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { useStaff } from "@/features/auth/staff-shell";
import {
  girviAccessToken,
  girviErrorMessage,
  newGirviIdempotencyKey,
} from "@/features/girvi/girvi-shared";
import { moveGirviCustodyRequest } from "@/lib/staff-api";

/**
 * Move a sealed packet to another shelf or locker. The jewellery stays customer
 * property in custody — this is never an inventory movement.
 */
export function GirviMovePacketDialog({
  isOpen,
  account,
  item,
  onClose,
}: {
  isOpen: boolean;
  account: GirviAccount;
  item: GirviCollateralItem | null;
  onClose: () => void;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const idempotencyKeyRef = useRef(newGirviIdempotencyKey());

  useEffect(() => {
    if (isOpen && item) {
      setLocation("");
      setNotes("");
      idempotencyKeyRef.current = newGirviIdempotencyKey();
    }
  }, [isOpen, item]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!item) {
        throw new Error("Select a packet.");
      }
      const next = location.trim();
      if (!next) {
        throw new Error("Enter the new custody location.");
      }
      if (next === item.custody_location) {
        throw new Error("Choose a different custody location.");
      }
      return moveGirviCustodyRequest(
        await girviAccessToken(),
        account.id,
        {
          collateral_item_id: item.id,
          custody_location: next,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        idempotencyKeyRef.current,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["girvi-account", staff.membership.organization_id, account.id],
      });
      onClose();
    },
  });

  function close() {
    if (mutation.isPending) {
      return;
    }
    mutation.reset();
    onClose();
  }

  if (!item) {
    return null;
  }

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => (!open ? close() : undefined)} isDismissable>
      <Modal className="max-w-md">
        <Dialog className="flex flex-col gap-4 p-6">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            Move packet
          </Heading>
          <p className="text-sm text-tertiary">
            Packet <span className="font-mono text-primary">{item.packet_number}</span> is currently at{" "}
            <span className="font-medium text-primary">{item.custody_location}</span>. Moving it does not change
            ownership or inventory.
          </p>
          <Input
            label="New custody location"
            value={location}
            onChange={setLocation}
            isRequired
            placeholder="Locker B / Shelf 3"
          />
          <Input label="Notes (optional)" value={notes} onChange={setNotes} />
          {mutation.isError ? (
            <p className="text-sm text-error-primary" role="alert">
              {girviErrorMessage(mutation.error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button color="secondary" size="md" onPress={close} isDisabled={mutation.isPending}>
              Cancel
            </Button>
            <Button color="primary" size="md" isLoading={mutation.isPending} onPress={() => mutation.mutate()}>
              Move packet
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
