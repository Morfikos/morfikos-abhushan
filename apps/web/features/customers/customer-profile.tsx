"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomerConsentPurpose, CustomerConsentStatus } from "@aabhushan/contracts";
import { customerInitials, normalizeShopPhone } from "@aabhushan/domain";
import { File06, NotificationBox, Scale01 } from "@untitledui/icons";

import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { PanelSkeleton, StaffDetailPageSkeleton } from "@/components/application/skeleton/skeleton";
import { Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { SectionCard } from "@/components/shared/section-card";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  consentPurposeLabel,
  customerAccessToken,
  customerErrorMessage,
  fieldError,
  WHATSAPP_PURPOSES,
  whatsappConsentBadgeColor,
  whatsappConsentShortLabel,
} from "@/features/customers/customer-shared";
import { CustomerSalesPanel } from "@/features/payments/customer-sales-panel";
import { CustomerGirviPanel } from "@/features/girvi/customer-girvi-panel";
import {
  fetchCustomer,
  fetchCustomerIdentityFiles,
  patchCustomerRequest,
  putCustomerConsentsRequest,
} from "@/lib/staff-api";
import { fetchFileAccessByObjectKey, uploadStaffFile } from "@/lib/staff-file-upload";

function ActivityEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Scale01;
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

function profilePhoneHint(phone: string, apiPhoneError: string | undefined): {
  hint: string;
  isInvalid: boolean;
} {
  if (apiPhoneError) {
    return { hint: apiPhoneError, isInvalid: true };
  }
  const parsed = normalizeShopPhone(phone);
  if (parsed.kind === "ok") {
    return { hint: `Stored as ${parsed.normalized}.`, isInvalid: false };
  }
  if (parsed.kind === "invalid") {
    return { hint: parsed.message, isInvalid: true };
  }
  return {
    hint: "Required for WhatsApp consent. 10-digit Indian numbers are stored as +91.",
    isInvalid: false,
  };
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
  const [identityUploadError, setIdentityUploadError] = useState<string | null>(null);
  const [identityUploading, setIdentityUploading] = useState(false);

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

  const phoneField = useMemo(
    () => profilePhoneHint(phone, fieldError(saveMutation.error, "phone")),
    [phone, saveMutation.error],
  );

  if (!allowed) {
    return null;
  }

  if (query.isLoading) {
    return <StaffDetailPageSkeleton withAvatar sections={2} label="Loading customer" />;
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
      <StaffPageHeader
        back={{ label: "Customers", href: "/customers" }}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar size="lg" initials={customerInitials(customer.display_name)} alt="" />
            {customer.display_name}
          </span>
        }
        badge={
          <Badge color={whatsappConsentBadgeColor(customer.whatsapp_consent)} size="sm">
            {whatsappConsentShortLabel(customer.whatsapp_consent)}
          </Badge>
        }
        description={
          <span className="font-mono text-sm tabular-nums">{customer.phone_display ?? "No phone"}</span>
        }
      />

      <Tabs defaultSelectedKey="profile" className="gap-6">
        <Tabs.List type="underline" size="md">
          <Tabs.Item id="profile" label="Profile" />
          <Tabs.Item id="sales" label="Sales" />
          <Tabs.Item id="girvi" label="Girvi" />
          <Tabs.Item id="notifications" label="Notifications" />
        </Tabs.List>

        <Tabs.Panel id="profile" className="pt-2">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <SectionCard
              title="Contact"
              description="Staff-only record. Customers do not have an account or portal."
            >
              <div className="grid gap-4 md:grid-cols-2">
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
                  type="tel"
                  value={phone}
                  isDisabled={!canWrite}
                  onChange={setPhone}
                  isInvalid={phoneField.isInvalid}
                  hint={phoneField.hint}
                />
              </div>
            </SectionCard>

            <SectionCard title="Details" description="Optional email, address, and staff notes.">
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
              {saveMutation.error ? (
                <p className="text-sm text-error-primary">{customerErrorMessage(saveMutation.error)}</p>
              ) : null}
              {canWrite ? (
                <StickyFormActions variant="inset">
                  <Button
                    color="primary"
                    size="md"
                    isLoading={saveMutation.isPending}
                    isDisabled={saveMutation.isPending}
                    onPress={() => saveMutation.mutate()}
                  >
                    Save profile
                  </Button>
                </StickyFormActions>
              ) : null}
            </SectionCard>

            <SectionCard
              title="WhatsApp consent"
              description="Phone required to grant. Revoking applies to future sends. Nothing is sent from this screen."
            >
              <div className="grid gap-3 md:grid-cols-2">
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
              </div>
              {consentMutation.error ? (
                <p className="text-sm text-error-primary">{customerErrorMessage(consentMutation.error)}</p>
              ) : null}
            </SectionCard>

            {canReadIdentity ? (
              <SectionCard
                title="Identity documents"
                description="Private files via signed upload. View uses a short-lived access URL."
                className="gap-3"
              >
                {identityQuery.isLoading ? <PanelSkeleton rows={3} showTitle={false} label="Loading identity files" /> : null}
                {identityQuery.isError ? (
                  <p className="text-sm text-error-primary">{customerErrorMessage(identityQuery.error)}</p>
                ) : null}
                {(identityQuery.data?.items.length ?? 0) === 0 && !identityQuery.isLoading ? (
                  <div className="flex items-center gap-3 rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary ring-1 ring-secondary ring-inset">
                      <File06 className="size-4 text-fg-quaternary" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-primary">No identity documents</p>
                      <p className="text-xs text-tertiary">Nothing recorded for this customer yet.</p>
                    </div>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {(identityQuery.data?.items ?? []).map((file) => (
                      <li
                        key={file.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary"
                      >
                        <div>
                          <p className="text-sm font-medium text-primary">{file.purpose}</p>
                          <p className="font-mono text-xs text-tertiary">
                            checksum {file.checksum_sha256.slice(0, 12)}…
                          </p>
                        </div>
                        <Button
                          color="link-color"
                          size="sm"
                          className="px-0"
                          onPress={() => {
                            void (async () => {
                              try {
                                const access = await fetchFileAccessByObjectKey(
                                  await customerAccessToken(),
                                  file.object_key,
                                );
                                window.open(access.url, "_blank", "noopener,noreferrer");
                              } catch (error) {
                                setIdentityUploadError(customerErrorMessage(error));
                              }
                            })();
                          }}
                        >
                          View
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite ? (
                  <FileUpload.Root>
                    <FileUpload.DropZone
                      className="py-3"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      allowsMultiple={false}
                      maxSize={5_242_880}
                      hint={`JPEG, PNG, or WebP (max. ${getReadableFileSize(5_242_880)}).`}
                      onDropFiles={(files) => {
                        const file = files[0];
                        if (!file) {
                          return;
                        }
                        setIdentityUploadError(null);
                        setIdentityUploading(true);
                        void (async () => {
                          try {
                            await uploadStaffFile({
                              accessToken: await customerAccessToken(),
                              ownerType: "customer",
                              ownerId: customerId,
                              file,
                              purpose: "identity",
                            });
                            await queryClient.invalidateQueries({
                              queryKey: ["customers", "identity", staff.membership.organization_id, customerId],
                            });
                          } catch (error) {
                            setIdentityUploadError(customerErrorMessage(error));
                          } finally {
                            setIdentityUploading(false);
                          }
                        })();
                      }}
                      onDropUnacceptedFiles={() => setIdentityUploadError("Use JPEG, PNG, or WebP.")}
                      onSizeLimitExceed={() => setIdentityUploadError("File is too large. Maximum size is 5 MB.")}
                    />
                  </FileUpload.Root>
                ) : null}
                {identityUploading ? <p className="text-sm text-tertiary">Uploading…</p> : null}
                {identityUploadError ? <p className="text-sm text-error-primary">{identityUploadError}</p> : null}
              </SectionCard>
            ) : (
              <p className="text-sm text-tertiary">Identity documents are restricted to authorized staff.</p>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="sales" className="pt-2">
          <CustomerSalesPanel customerId={customerId} />
        </Tabs.Panel>

        <Tabs.Panel id="girvi" className="pt-2">
          <CustomerGirviPanel customerId={customerId} />
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
