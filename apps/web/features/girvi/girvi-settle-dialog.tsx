"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GirviAccount, GirviSettlementResult, PaymentMethod } from "@aabhushan/contracts";
import { parseDate } from "@internationalized/date";
import { Heading } from "react-aria-components";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { DefinitionListSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { MethodSelect } from "@/components/shared/method-select";
import { MoneyInput } from "@/components/shared/money-input";
import { useStaff } from "@/features/auth/staff-shell";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import {
  GIRVI_RATE_PERIOD_LABEL,
  girviAccessToken,
  girviErrorMessage,
  girviToday,
  newGirviIdempotencyKey,
} from "@/features/girvi/girvi-shared";
import { MoneyText } from "@/components/shared/money-text";
import { formatInr, isMoneyShape, isZeroMoney, moneyEquals, subtractMoney, sumMoney } from "@/lib/money";
import { quoteGirviSettlementRequest, settleGirviAccountRequest } from "@/lib/staff-api";

export function GirviSettleDialog({
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
  const [businessDate, setBusinessDate] = useState(girviToday());
  const [collected, setCollected] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [waiveRemainder, setWaiveRemainder] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
  const [notes, setNotes] = useState("");
  const [posted, setPosted] = useState<GirviSettlementResult["settlement"] | null>(null);
  const idempotencyKeyRef = useRef<string>(newGirviIdempotencyKey());

  useEffect(() => {
    if (isOpen) {
      setBusinessDate(girviToday());
    }
  }, [isOpen]);

  const quote = useQuery({
    queryKey: ["girvi-settlement-quote", staff.membership.organization_id, account.id, businessDate],
    queryFn: async () => quoteGirviSettlementRequest(await girviAccessToken(), account.id, businessDate),
    enabled: isOpen,
    // A quote is only valid for the date and ledger it was calculated from.
    gcTime: 0,
  });

  // Default the collection to the full payable whenever a fresh quote arrives.
  useEffect(() => {
    if (quote.data) {
      setCollected(quote.data.payoff_inr);
    }
  }, [quote.data]);

  const payoff = quote.data?.payoff_inr ?? "0.00";
  const remainder = subtractMoney(payoff, isMoneyShape(collected.trim()) ? collected.trim() : "0.00");
  const remainderIsPositive = !isZeroMoney(remainder) && !remainder.startsWith("-");

  const mutation = useMutation({
    mutationFn: async () =>
      settleGirviAccountRequest(
        await girviAccessToken(),
        account.id,
        {
          business_date: businessDate,
          confirm_payoff_inr: payoff,
          amount_inr: collected.trim(),
          ...(isZeroMoney(collected.trim()) ? {} : { method }),
          ...(waiveRemainder && remainderIsPositive
            ? { waiver_inr: remainder, waiver_reason: waiverReason.trim() }
            : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        idempotencyKeyRef.current,
      ),
    onSuccess: async (result) => {
      setPosted(result.settlement);
      toast.success(`${account.account_number} · settlement posted`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["girvi-account", staff.membership.organization_id, account.id] }),
        queryClient.invalidateQueries({ queryKey: ["girvi-statement", staff.membership.organization_id, account.id] }),
        queryClient.invalidateQueries({ queryKey: ["girvi-accounts", staff.membership.organization_id] }),
      ]);
    },
  });

  function close() {
    setCollected("");
    setWaiveRemainder(false);
    setWaiverReason("");
    setNotes("");
    setPosted(null);
    mutation.reset();
    idempotencyKeyRef.current = newGirviIdempotencyKey();
    onClose();
  }

  const submitReason = (() => {
    if (quote.isLoading) {
      return "Calculating the payable for this date…";
    }
    if (quote.isError) {
      return girviErrorMessage(quote.error);
    }
    if (!isMoneyShape(collected.trim())) {
      return "Enter the amount collected. Use 0 if the whole balance is waived.";
    }
    if (remainder.startsWith("-")) {
      return `More than the payable of ${formatInr(payoff)}. Overpayment is not accepted.`;
    }
    if (remainderIsPositive && !waiveRemainder) {
      return `${formatInr(remainder)} is still short. Collect the full payable or record an authorized waiver.`;
    }
    if (remainderIsPositive && waiveRemainder && waiverReason.trim().length < 5) {
      return "Write the reason for the waiver.";
    }
    if (!moneyEquals(sumMoney([collected.trim(), remainderIsPositive && waiveRemainder ? remainder : "0.00"]), payoff)) {
      return `Collected plus waiver must equal ${formatInr(payoff)}.`;
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
              Settle Girvi account
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
                    Settled on {posted.business_date}. Collected {formatInr(posted.amount_inr)}
                    {isZeroMoney(posted.waiver_inr) ? "" : `, waived ${formatInr(posted.waiver_inr)}`}.
                  </p>
                </div>
                <p className="text-sm text-tertiary">
                  The packets are still in the shop. Release collateral is a separate step with its own permission and
                  packet check.
                </p>
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
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-secondary">Settlement date</span>
                  <DatePicker
                    value={parseDate(businessDate)}
                    aria-label="Settlement business date"
                    onChange={(value) => {
                      if (value) {
                        setBusinessDate(value.toString());
                      }
                    }}
                  />
                </div>

                {quote.isLoading ? <DefinitionListSkeleton rows={3} label="Calculating payable" /> : null}
                {quote.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {girviErrorMessage(quote.error)}
                  </p>
                ) : null}

                {quote.data ? (
                  <dl className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-3 text-sm ring-1 ring-secondary">
                    <div className="flex justify-between gap-3">
                      <dt className="text-tertiary">Principal outstanding</dt>
                      <MoneyText amount={quote.data.principal_outstanding_inr} as="dd" className="text-primary" />
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-tertiary">Interest outstanding</dt>
                      <MoneyText amount={quote.data.interest_outstanding_inr} as="dd" className="text-primary" />
                    </div>
                    <div className="flex justify-between gap-3 border-t border-secondary pt-2">
                      <dt className="font-medium text-secondary">Payable</dt>
                      <MoneyText amount={quote.data.payoff_inr} as="dd" className="font-medium text-primary" />
                    </div>
                    <p className="text-xs text-tertiary">
                      {quote.data.rate_percent_per_30_days}% {GIRVI_RATE_PERIOD_LABEL} · quoted for{" "}
                      {quote.data.business_date}. Changing the date recalculates it.
                    </p>
                  </dl>
                ) : null}

                <MoneyInput
                  label="Amount collected"
                  value={collected}
                  onChange={setCollected}
                  isDisabled={mutation.isPending}
                  isInvalid={remainder.startsWith("-")}
                  hint={`of ${formatInr(payoff)} payable`}
                />

                {isZeroMoney(collected.trim()) ? null : (
                  <MethodSelect label="Method" value={method} onChange={setMethod} isDisabled={mutation.isPending} />
                )}

                {remainderIsPositive ? (
                  canWaive ? (
                    <div className="flex flex-col gap-3 rounded-lg bg-primary px-3 py-3 ring-1 ring-secondary">
                      <Checkbox
                        isSelected={waiveRemainder}
                        isDisabled={mutation.isPending}
                        onChange={setWaiveRemainder}
                        label={`Waive the remaining ${formatInr(remainder)}`}
                        hint="Recorded as an authorized write-off against this account."
                      />
                      {waiveRemainder ? (
                        <Input
                          label="Waiver reason"
                          value={waiverReason}
                          onChange={setWaiverReason}
                          isDisabled={mutation.isPending}
                          placeholder="Why the shop is writing this off"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-warning-primary">
                      {formatInr(remainder)} is short. Only an owner or admin can waive a Girvi balance.
                    </p>
                  )
                ) : null}

                <Input
                  label="Notes (optional)"
                  value={notes}
                  onChange={setNotes}
                  isDisabled={mutation.isPending}
                  placeholder="Anything the shop should remember about this settlement"
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
                  Settle account
                </Button>
              </footer>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
