"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GirviAccount, GirviRepaymentAllocationDto, PaymentMethod } from "@aabhushan/contracts";
import { parseDate } from "@internationalized/date";
import { Heading } from "react-aria-components";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { DefinitionListSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
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
import { compareMoney, formatInr, isPositiveMoney, subtractMoney } from "@/lib/money";
import { paymentMethodLabel } from "@/lib/payment-methods";
import { fetchGirviStatement, recordGirviRepaymentRequest } from "@/lib/staff-api";

/**
 * Interest first, then principal — the approved `girvi.v1` allocation order. The split
 * shown here comes from the server statement for the chosen business date, and the
 * server rejects the post if that split moved before it committed.
 */
function splitFor(amount: string, interestOutstanding: string): { interest: string; principal: string } {
  const interest = compareMoney(amount, interestOutstanding) >= 0 ? interestOutstanding : amount;
  return { interest, principal: subtractMoney(amount, interest) };
}

function SummaryRow({ label, amount, tone = "default" }: { label: string; amount: string; tone?: "default" | "strong" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tertiary">{label}</dt>
      <dd className={`tabular-nums ${tone === "strong" ? "font-medium text-primary" : "text-primary"}`}>
        {formatInr(amount)}
      </dd>
    </div>
  );
}

export function GirviRepaymentDialog({
  isOpen,
  account,
  onClose,
}: {
  isOpen: boolean;
  account: GirviAccount;
  onClose: () => void;
}) {
  const staff = useStaff();
  const toast = useStaffToast();
  const queryClient = useQueryClient();
  const [businessDate, setBusinessDate] = useState(girviToday());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [posted, setPosted] = useState<GirviRepaymentAllocationDto | null>(null);
  const idempotencyKeyRef = useRef<string>(newGirviIdempotencyKey());

  useEffect(() => {
    if (isOpen) {
      setBusinessDate(girviToday());
    }
  }, [isOpen]);

  const statement = useQuery({
    queryKey: ["girvi-statement", staff.membership.organization_id, account.id, businessDate],
    queryFn: async () => fetchGirviStatement(await girviAccessToken(), account.id, businessDate),
    enabled: isOpen,
  });

  const split = useMemo(
    () => splitFor(amount.trim(), statement.data?.interest_outstanding_inr ?? "0.00"),
    [amount, statement.data?.interest_outstanding_inr],
  );

  const mutation = useMutation({
    mutationFn: async () =>
      recordGirviRepaymentRequest(
        await girviAccessToken(),
        account.id,
        {
          business_date: businessDate,
          amount_inr: amount.trim(),
          method,
          confirm_interest_paid_inr: split.interest,
          confirm_principal_paid_inr: split.principal,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
        idempotencyKeyRef.current,
      ),
    onSuccess: async (result) => {
      setPosted(result.allocation);
      toast.success(`${account.account_number} · repayment recorded`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["girvi-account", staff.membership.organization_id, account.id] }),
        queryClient.invalidateQueries({ queryKey: ["girvi-statement", staff.membership.organization_id, account.id] }),
        queryClient.invalidateQueries({ queryKey: ["girvi-accounts", staff.membership.organization_id] }),
      ]);
    },
  });

  function reset() {
    setAmount("");
    setNotes("");
    setLocalError(null);
    setPosted(null);
    mutation.reset();
    idempotencyKeyRef.current = newGirviIdempotencyKey();
  }

  function close() {
    reset();
    onClose();
  }

  const payoff = statement.data?.payoff_inr ?? "0.00";
  const isOverPayoff = isPositiveMoney(amount.trim()) && compareMoney(amount.trim(), payoff) > 0;

  const submitReason = (() => {
    if (statement.isLoading) {
      return "Loading the statement for this date…";
    }
    if (statement.isError) {
      return girviErrorMessage(statement.error);
    }
    if (!isPositiveMoney(amount.trim())) {
      return "Enter the amount received.";
    }
    if (isOverPayoff) {
      return `More than the settlement payable of ${formatInr(payoff)}. Settle the account instead.`;
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
              Record repayment
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
                    Received {formatInr(posted.amount_inr)} on {posted.business_date} by{" "}
                    {paymentMethodLabel(posted.method)}
                  </p>
                </div>
                <dl className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-3 text-sm ring-1 ring-secondary">
                  <SummaryRow label="Interest paid" amount={posted.interest_paid_inr} />
                  <SummaryRow label="Principal paid" amount={posted.principal_paid_inr} />
                  <SummaryRow label="Interest remaining" amount={posted.interest_outstanding_inr} />
                  <SummaryRow label="Principal remaining" amount={posted.principal_outstanding_inr} />
                  <SummaryRow label="Settlement payable now" amount={posted.payoff_inr} tone="strong" />
                </dl>
                {posted.clears_account ? (
                  <p className="text-sm text-tertiary">
                    Nothing is due. Settle the account to close it financially, then release the packets as a separate
                    step.
                  </p>
                ) : null}
              </div>
              <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-secondary px-5 py-4">
                <Button color="secondary" size="md" onPress={reset}>
                  Record another
                </Button>
                <Button color="primary" size="md" onPress={close}>
                  Done
                </Button>
              </footer>
            </>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-secondary">Business date</span>
                  <DatePicker
                    value={parseDate(businessDate)}
                    aria-label="Repayment business date"
                    onChange={(value) => {
                      if (value) {
                        setBusinessDate(value.toString());
                        setLocalError(null);
                      }
                    }}
                  />
                  <p className="text-xs text-tertiary">
                    Backdating is disabled. Interest accrues from the start date, counting the start date and excluding
                    this date.
                  </p>
                </div>

                {statement.isLoading ? <DefinitionListSkeleton rows={3} label="Loading statement" /> : null}
                {statement.isError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {girviErrorMessage(statement.error)}
                  </p>
                ) : null}

                {statement.data ? (
                  <dl className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-3 text-sm ring-1 ring-secondary">
                    <SummaryRow label="Principal outstanding" amount={statement.data.principal_outstanding_inr} />
                    <SummaryRow label="Interest outstanding" amount={statement.data.interest_outstanding_inr} />
                    <SummaryRow label="Settlement payable" amount={statement.data.payoff_inr} tone="strong" />
                    <p className="text-xs text-tertiary">
                      {statement.data.rate_percent_per_30_days}% {GIRVI_RATE_PERIOD_LABEL} · simple interest on
                      outstanding principal
                    </p>
                  </dl>
                ) : null}

                <MoneyInput
                  label="Amount received"
                  value={amount}
                  onChange={(value) => {
                    setAmount(value);
                    setLocalError(null);
                  }}
                  isDisabled={mutation.isPending}
                  isInvalid={isOverPayoff}
                  hint={`of ${formatInr(payoff)} payable`}
                />

                <MethodSelect
                  label="Method"
                  value={method}
                  onChange={setMethod}
                  isDisabled={mutation.isPending}
                />

                {isPositiveMoney(amount.trim()) && statement.data ? (
                  <dl className="flex flex-col gap-2 rounded-lg bg-primary px-3 py-3 text-sm ring-1 ring-secondary">
                    <p className="text-sm font-medium text-primary">Proposed split</p>
                    <SummaryRow label="Interest paid" amount={split.interest} />
                    <SummaryRow label="Principal paid" amount={split.principal} />
                    <SummaryRow
                      label="Interest remaining"
                      amount={subtractMoney(statement.data.interest_outstanding_inr, split.interest)}
                    />
                    <SummaryRow
                      label="Principal remaining"
                      amount={subtractMoney(statement.data.principal_outstanding_inr, split.principal)}
                    />
                    <p className="text-xs text-tertiary">
                      Outstanding interest is cleared first; the remainder reduces principal from this business date.
                    </p>
                  </dl>
                ) : null}

                <Input
                  label="Notes (optional)"
                  value={notes}
                  onChange={setNotes}
                  isDisabled={mutation.isPending}
                  placeholder="Anything the shop should remember about this collection"
                />

                {localError ? (
                  <p className="text-sm text-error-primary" role="alert">
                    {localError}
                  </p>
                ) : null}
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
                  onPress={() => {
                    setLocalError(null);
                    mutation.mutate();
                  }}
                >
                  Record repayment
                </Button>
              </footer>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
