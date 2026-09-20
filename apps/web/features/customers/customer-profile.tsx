"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerConsentPurpose, CustomerConsentStatus } from "@aabhushan/contracts";
import { customerInitials } from "@aabhushan/domain";
import { File06, NotificationBox, Scale01, ShoppingBag03 } from "@untitledui/icons";

import { EmptyState } from "@/components/application/empty-state/empty-state";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  consentPurposeLabel,
  customerAccessToken,
  customerErrorMessage,
  fieldError,
  WHATSAPP_PURPOSES,
  whatsappConsentLabel,
} from "@/features/customers/customer-shared";
import {
  fetchCustomer,
  fetchCustomerIdentityFiles,
  patchCustomerRequest,
  putCustomerConsentsRequest,
} from "@/lib/staff-api";

function ActivityEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShoppingBag03;
  title: string;
  description: string;
}) {
  return (
    <EmptyState size="md" className="mx-auto py-10">
      <EmptyState.Header pattern="none">
        <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
          <Icon className="size-6 text-fg-quaternary" aria-hidden="true" />
        </div>
        <EmptyState.Content>
          <p className="text-lg font-semibold text-primary">{title}</p>
          <EmptyState.Description>{description}</EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Header>
    </EmptyState>
  );
}

export function CustomerProfile({ customerId }: { customerId: string }) {
  const staff = useStaff();
  const router = useRouter();
  const queryClient = useQueryClient();
  const allowed = staffHasPermission(staff, "customers.read") || staffHasPermission(staff, "customers.write");
  const canWrite = staffHasPermission(staff, "customers.write");
  const canReadIdentity = staffHasPermission(staff, "identity_documents.read");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  const query = useQuery({
    queryKey: ["customers", "detail", staff.membership.organization_id, customerId],
    queryFn: async () => fetchCustomer(await customerAccessToken(), customerId),
    enabled: allowed,
  });

  const identityQuery = useQuery({
    queryKey: ["customers", "identity", staff.membership.organization_id, customerId],
    queryFn: async () => fetchCustomerIdentityFiles(await customerAccessToken(), customerId),
    enabled: allowed && canReadIdentity,
  });

  useEffect(() => {
    const customer = query.data;
    if (!customer || hydrated) {
      return;
    }
    setDisplayName(customer.display_name);
    setPhone(customer.phone_display ?? "");
    setEmail(customer.email ?? "");
    setAddressLine(customer.address_line ?? "");
    setNotes(customer.notes ?? "");
    setHydrated(true);
  }, [hydrated, query.data]);

  const consentsByPurpose = useMemo(() => {
    const map = new Map<CustomerConsentPurpose, CustomerConsentStatus>();
    for (const item of query.data?.consents ?? []) {
      map.set(item.purpose, item.status);
    }
    return map;
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      patchCustomerRequest(await customerAccessToken(), customerId, {
        display_name: displayName.trim(),
        phone: phone.trim().length > 0 ? phone.trim() : null,
        email: email.trim().length > 0 ? email.trim() : null,
        address_line: addressLine.trim().length > 0 ? addressLine.trim() : null,
        notes: notes.trim().length > 0 ? notes.trim() : null,
      }),
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.setQueryData(["customers", "detail", staff.membership.organization_id, customerId], customer);
    },
  });

  const consentMutation = useMutation({
    mutationFn: async (input: { purpose: CustomerConsentPurpose; status: CustomerConsentStatus }) => {
      const language = query.data?.consents.find((item) => item.purpose === input.purpose)?.language ?? "en";
      return putCustomerConsentsRequest(await customerAccessToken(), customerId, {
        items: [
          {
            channel: "whatsapp",
            purpose: input.purpose,
            status: input.status,
            language,
          },
        ],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  if (!allowed) {
    return null;
  }

  if (query.isLoading) {
    return <LoadingIndicator size="md" label="Loading customer" />;
  }

  if (query.isError) {
    return (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-error-primary">{customerErrorMessage(query.error)}</p>
        <Button color="secondary" size="md" href="/customers">
          Back to directory
        </Button>
      </section>
    );
  }

  const customer = query.data;
  if (!customer) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Avatar size="lg" initials={customerInitials(customer.display_name)} alt="" />
          <div>
            <h1 className="text-display-xs font-semibold text-primary">{customer.display_name}</h1>
            <p className="text-md text-tertiary">{customer.phone_display ?? "No phone"}</p>
            <Badge color={customer.whatsapp_consent === "granted" ? "success" : "gray"} size="sm" className="mt-2">
              {whatsappConsentLabel(customer.whatsapp_consent)}
            </Badge>
          </div>
        </div>
        <Button color="secondary" size="md" href="/customers">
          Back to directory
        </Button>
      </div>

      <Tabs defaultSelectedKey="profile" className="gap-6">
        <Tabs.List type="underline" size="md">
          <Tabs.Item id="profile" label="Profile" />
          <Tabs.Item id="sales" label="Sales" />
          <Tabs.Item id="girvi" label="Girvi" />
          <Tabs.Item id="notifications" label="Notifications" />
        </Tabs.List>

        <Tabs.Panel id="profile" className="flex flex-col gap-6 pt-2">
          <div className="grid gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:grid-cols-2 md:p-5">
            <Input
              label="Name"
              isRequired
              value={displayName}
              isDisabled={!canWrite}
              onChange={setDisplayName}
              isInvalid={Boolean(fieldError(saveMutation.error, "display_name"))}
              hint={fieldError(saveMutation.error, "display_name")}
            />
            <Input
              label="Phone"
              value={phone}
              isDisabled={!canWrite}
              onChange={setPhone}
              isInvalid={Boolean(fieldError(saveMutation.error, "phone"))}
              hint={fieldError(saveMutation.error, "phone") ?? "Required for WhatsApp consent."}
            />
            <Input
              label="Email"
              value={email}
              isDisabled={!canWrite}
              onChange={setEmail}
              isInvalid={Boolean(fieldError(saveMutation.error, "email"))}
              hint={fieldError(saveMutation.error, "email")}
            />
            <Input label="Address" value={addressLine} isDisabled={!canWrite} onChange={setAddressLine} />
            <div className="md:col-span-2">
              <TextArea
                label="Staff notes"
                value={notes}
                isDisabled={!canWrite}
                onChange={setNotes}
                rows={4}
                hint="Staff only. Not shown to the customer."
              />
            </div>
            {saveMutation.error ? (
              <p className="text-sm text-error-primary md:col-span-2">{customerErrorMessage(saveMutation.error)}</p>
            ) : null}
            {canWrite ? (
              <div className="md:col-span-2">
                <Button
                  color="primary"
                  size="md"
                  isLoading={saveMutation.isPending}
                  isDisabled={saveMutation.isPending}
                  onPress={() => saveMutation.mutate()}
                >
                  Save profile
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
            <div>
              <h2 className="text-lg font-semibold text-primary">WhatsApp consent</h2>
              <p className="text-sm text-tertiary">
                Stored per purpose. Revoking is immediate for future sends and does not delete notification history.
                A phone number is required to grant consent. Nothing is sent from this screen.
              </p>
            </div>
            {WHATSAPP_PURPOSES.map((purpose) => {
              const status = consentsByPurpose.get(purpose) ?? null;
              const granted = status === "granted";
              return (
                <Toggle
                  key={purpose}
                  className="w-full"
                  isSelected={granted}
                  isDisabled={!canWrite || consentMutation.isPending}
                  onChange={(selected) =>
                    consentMutation.mutate({ purpose, status: selected ? "granted" : "revoked" })
                  }
                  label={consentPurposeLabel(purpose)}
                  hint={granted ? "Granted for future sends." : "Not granted."}
                />
              );
            })}
            {consentMutation.error ? (
              <p className="text-sm text-error-primary">{customerErrorMessage(consentMutation.error)}</p>
            ) : null}
          </div>

          {canReadIdentity ? (
            <div className="rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5">
              <h2 className="text-lg font-semibold text-primary">Identity documents</h2>
              {identityQuery.isLoading ? <LoadingIndicator size="sm" label="Loading identity files" /> : null}
              {identityQuery.isError ? (
                <p className="text-sm text-error-primary">{customerErrorMessage(identityQuery.error)}</p>
              ) : null}
              {(identityQuery.data?.items.length ?? 0) === 0 && !identityQuery.isLoading ? (
                <ActivityEmpty
                  icon={File06}
                  title="No identity documents"
                  description="Metadata only in this unit. File bytes are stored in a later documents spec."
                />
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {(identityQuery.data?.items ?? []).map((file) => (
                    <li key={file.id} className="text-sm text-secondary">
                      {file.purpose} · checksum {file.checksum_sha256.slice(0, 12)}…
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-tertiary">Identity documents are restricted to authorized staff.</p>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="sales" className="pt-2">
          <ActivityEmpty
            icon={ShoppingBag03}
            title="No sales yet"
            description="Sales invoices and outstanding dues will appear here. This section stays separate from Girvi even when empty."
          />
        </Tabs.Panel>

        <Tabs.Panel id="girvi" className="pt-2">
          <ActivityEmpty
            icon={Scale01}
            title="No Girvi accounts yet"
            description="Girvi loans and collateral stay on this tab, separate from sales dues, even when there are zero records."
          />
        </Tabs.Panel>

        <Tabs.Panel id="notifications" className="pt-2">
          <ActivityEmpty
            icon={NotificationBox}
            title="No notification history yet"
            description="Transactional WhatsApp history will appear here after messaging is implemented. Consent changes do not delete history."
          />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
