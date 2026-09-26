"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { FormSkeleton } from "@/components/application/skeleton/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
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
    return (
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <StaffPageHeader
          title="New customer"
          description="Create a staff-only record. This is not a customer account and does not send WhatsApp messages."
          back={{ label: "Customers", href: "/customers" }}
        />
        <FormSkeleton sections={2} fieldsPerSection={3} showStickyActions label="Loading customer form" />
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <StaffPageHeader
        title="New customer"
        description="Create a staff-only record. This is not a customer account and does not send WhatsApp messages."
        back={{ label: "Customers", onPress: requestCancel }}
      />
      <CustomerForm
        initial={initial}
        submitLabel="Save customer"
        isSubmitting={mutation.isPending}
        error={mutation.error}
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
