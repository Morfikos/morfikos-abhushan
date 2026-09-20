"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  CustomerForm,
  customerCreatePayload,
  emptyCustomerForm,
} from "@/features/customers/customer-form";
import { customerAccessToken } from "@/features/customers/customer-shared";
import { createCustomerRequest, fetchReminders } from "@/lib/staff-api";

export function CustomerCreatePage() {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "customers.write");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const reminders = useQuery({
    queryKey: ["shop", "reminders", staff.membership.organization_id],
    queryFn: async () => fetchReminders(await customerAccessToken()),
    enabled: allowed,
  });

  const initial = useMemo(
    () => emptyCustomerForm(reminders.data?.language ?? "en"),
    [reminders.data?.language],
  );

  const mutation = useMutation({
    mutationFn: async (values: Parameters<typeof customerCreatePayload>[0]) =>
      createCustomerRequest(await customerAccessToken(), customerCreatePayload(values)),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      router.push(`/customers/${customer.id}`);
    },
  });

  function requestCancel() {
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    router.push("/customers");
  }

  if (!allowed) {
    return null;
  }

  if (reminders.isLoading) {
    return <LoadingIndicator size="md" label="Loading customer form" />;
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-display-xs font-semibold text-primary">New customer</h1>
          <p className="text-md text-tertiary">
            Create a staff-only record. This is not a customer account and does not send WhatsApp messages.
          </p>
        </div>
        <Button color="secondary" size="md" onPress={requestCancel}>
          Back to directory
        </Button>
      </div>
      <CustomerForm
        initial={initial}
        submitLabel="Save customer"
        isSubmitting={mutation.isPending}
        error={mutation.error}
        actionsClassName="sticky bottom-0 z-10 -mx-4 border-t border-secondary bg-primary px-4 py-4 md:-mx-6 md:px-6"
        onSubmit={(values) => mutation.mutate(values)}
        onCancel={requestCancel}
        onDirtyChange={setFormDirty}
      />
      <ConfirmDialog
        isOpen={discardOpen}
        title="Discard customer?"
        message="Unsaved changes will be lost."
        confirmLabel="Discard"
        confirmColor="primary-destructive"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          router.push("/customers");
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </section>
  );
}
