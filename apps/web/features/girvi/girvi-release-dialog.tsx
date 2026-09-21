"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GirviAccount, GirviReleaseEvent } from "@aabhushan/contracts";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import {
  girviAccessToken,
  girviErrorMessage,
  newGirviIdempotencyKey,
} from "@/features/girvi/girvi-shared";
import { releaseGirviCollateralRequest } from "@/lib/staff-api";

/**
 * Physical handover. Packets are checked one by one against custody, both sides
 * acknowledge, and the released jewellery never becomes shop stock.
 */
export function GirviReleaseDialog({
  isOpen,
  account,
  canWaive,
  onClose,
}: {
  isOpen: boolean;
  account: GirviAccount;
  canWaive: boolean;
  onClose: () => void;
}) {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const inCustody = useMemo(
    () => account.collateral.filter((item) => item.status === "in_custody"),
    [account.collateral],
  );
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [recipientName, setRecipientName] = useState(account.customer_display_name);
  const [customerAcknowledged, setCustomerAcknowledged] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [notes, setNotes] = useState("");
  const [posted, setPosted] = useState<GirviReleaseEvent | null>(null);
  const idempotencyKeyRef = useRef<string>(newGirviIdempotencyKey());

  const mutation = useMutation({
    mutationFn: async () =>
      releaseGirviCollateralRequest(
        await girviAccessToken(),
        account.id,
        {
          verify_packet_numbers: inCustody
            .filter((item) => verified.has(item.id))
            .map((item) => item.packet_number),
          recipient_name: recipientName.trim(),
          customer_acknowledged: true,
          ...(waiverReason.trim() ? { waiver_reason: waiverReason.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        idempotencyKeyRef.current,
      ),
    onSuccess: async (result) => {
      setPosted(result.release);
      toast.success(`${account.account_number} · collateral released`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["girvi-account", staff.membership.organization_id, account.id] }),
        queryClient.invalidateQueries({ queryKey: ["girvi-accounts", staff.membership.organization_id] }),
      ]);
    },
  });

  function close() {
    setVerified(new Set());
    setCustomerAcknowledged(false);
    setWaiverReason("");
    setNotes("");
    setPosted(null);
    mutation.reset();
    idempotencyKeyRef.current = newGirviIdempotencyKey();
    onClose();
  }

  const allVerified = inCustody.length > 0 && verified.size === inCustody.length;

  const submitReason = (() => {
    if (inCustody.length === 0) {
      return "No packets are in custody on this account.";
    }
    if (!allVerified) {
      return "Check every packet physically before releasing.";
    }
    if (recipientName.trim().length === 0) {
      return "Record who is collecting the packets.";
    }
    if (!customerAcknowledged) {
      return "The customer must acknowledge receiving the collateral.";
    }
    return null;
  })();

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!mutation.isPending}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          close();
        }
      }}
    >
      <Modal className="max-w-xl">
        <Dialog className="flex max-h-[inherit] flex-col overflow-hidden p-0 outline-hidden">
          <header className="flex shrink-0 flex-col gap-1 border-b border-secondary px-5 py-4">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              Release collateral
            </Heading>
            <p className="text-sm text-tertiary">
              {account.account_number} · {account.customer_display_name}
            </p>
          </header>

          {posted ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <div className="rounded-lg bg-success-primary px-3 py-3 ring-1 ring-success" role="status">
                  <p className="text-sm font-medium text-primary">
                    Released {posted.packet_numbers_verified.length} packet
                    {posted.packet_numbers_verified.length === 1 ? "" : "s"} to {posted.recipient_name}.
                  </p>
                  <p className="mt-1 font-mono text-xs text-tertiary">
                    {posted.packet_numbers_verified.join(", ")}
                  </p>
                </div>
              </div>
              <footer className="flex shrink-0 justify-end gap-2 border-t border-secondary px-5 py-4">
                <Button color="primary" size="md" onPress={close}>
                  Done
                </Button>
              </footer>
            </>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-3 rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary">
                  <p className="text-sm font-medium text-primary">Verify each packet in hand</p>
                  {inCustody.length === 0 ? (
                    <p className="text-sm text-tertiary">No packets are in custody on this account.</p>
                  ) : (
                    inCustody.map((item) => (
                      <Checkbox
                        key={item.id}
                        isSelected={verified.has(item.id)}
                        isDisabled={mutation.isPending}
                        onChange={(isSelected) => {
                          setVerified((current) => {
                            const next = new Set(current);
                            if (isSelected) {
                              next.add(item.id);
                            } else {
                              next.delete(item.id);
                            }
                            return next;
                          });
                        }}
                        label={
                          <span>
                            <span className="font-mono">{item.packet_number}</span> · {item.description}
                          </span>
                        }
                        hint={item.custody_location}
                      />
                    ))
                  )}
                </div>

                <Input
                  label="Collected by"
                  value={recipientName}
                  onChange={setRecipientName}
                  isDisabled={mutation.isPending}
                  hint="The person physically taking the packets."
                />

                <Checkbox
                  isSelected={customerAcknowledged}
                  isDisabled={mutation.isPending}
                  onChange={setCustomerAcknowledged}
                  label="The customer acknowledged receiving the collateral"
                />

                {canWaive ? (
                  <Input
                    label="Waiver reason (only if releasing without a settlement event)"
                    value={waiverReason}
                    onChange={setWaiverReason}
                    isDisabled={mutation.isPending}
                    placeholder="Leave empty for a normal settled release"
                  />
                ) : null}

                <Input
                  label="Notes (optional)"
                  value={notes}
                  onChange={setNotes}
                  isDisabled={mutation.isPending}
                  placeholder="Anything the shop should remember about this handover"
                />

                {mutation.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {girviErrorMessage(mutation.error)}
                  </p>
                ) : null}
              </div>
              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-secondary px-5 py-4">
                {submitReason ? <p className="mr-auto text-xs text-tertiary">{submitReason}</p> : null}
                <Button color="secondary" size="md" isDisabled={mutation.isPending} onPress={close}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  size="md"
                  isDisabled={Boolean(submitReason)}
                  isLoading={mutation.isPending}
                  onPress={() => mutation.mutate()}
                >
                  Release collateral
                </Button>
              </footer>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
