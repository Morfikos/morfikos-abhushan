"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type Key, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  DeviceSettings,
  DocumentSequence,
  InvitibleStaffRole,
  ReminderSettings,
  ShopProfile,
  StaffMembershipStatus,
} from "@aabhushan/contracts";
import { SHOP_LOGO_MAX_BYTES } from "@aabhushan/domain";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  createMetalRateRequest,
  deleteMakingChargeDefaultRequest,
  fetchAudit,
  fetchDevices,
  fetchMakingChargeDefaults,
  fetchMetalRates,
  fetchReminders,
  fetchSequences,
  fetchShopProfile,
  fetchStaffDirectory,
  inviteStaffRequest,
  patchDevices,
  patchReminders,
  patchSequences,
  patchShopProfile,
  removeShopLogoRequest,
  StaffApiError,
  suspendStaffRequest,
  uploadShopLogoRequest,
  upsertMakingChargeDefaultRequest,
} from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SettingsTab = "profile" | "staff" | "rates" | "sequences" | "devices" | "reminders" | "audit";

async function accessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

function statusLabel(status: StaffMembershipStatus): string {
  if (status === "invited") {
    return "Invited";
  }
  if (status === "suspended") {
    return "Suspended";
  }
  return "Active";
}

function statusColor(status: StaffMembershipStatus): "success" | "warning" | "gray" {
  if (status === "active") {
    return "success";
  }
  if (status === "invited") {
    return "warning";
  }
  return "gray";
}

function errorMessage(error: unknown): string {
  return error instanceof StaffApiError ? error.message : "The request failed. Try again.";
}

function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5 ${className ?? ""}`}>
      <div>
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        {description ? <p className="text-sm text-tertiary">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StickySave({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-secondary bg-primary px-4 py-4 md:-mx-5 md:px-5">
      {children}
    </div>
  );
}

function auditActionLabel(action: string): string {
  const parts = action.split(".");
  if (parts.length === 0) {
    return action;
  }
  const verb = parts[parts.length - 1] ?? "";
  const subject = parts
    .slice(0, -1)
    .join(" ")
    .replace(/_/g, " ");
  const verbPast =
    verb === "update"
      ? "updated"
      : verb === "create"
        ? "created"
        : verb === "delete"
          ? "deleted"
          : verb === "assign"
            ? "assigned"
            : verb === "adjust"
              ? "adjusted"
              : verb.replace(/_/g, " ");
  if (!subject) {
    return verbPast.charAt(0).toUpperCase() + verbPast.slice(1);
  }
  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verbPast}`;
}

function truncateId(id: string): string {
  if (id.length <= 12) {
    return id;
  }
  return `${id.slice(0, 8)}…`;
}

const SETTINGS_TABS: SettingsTab[] = [
  "profile",
  "staff",
  "rates",
  "sequences",
  "devices",
  "reminders",
  "audit",
];

function settingsTabFromSearch(value: string | null): SettingsTab {
  if (value && (SETTINGS_TABS as string[]).includes(value)) {
    return value as SettingsTab;
  }
  return "profile";
}

export function SettingsWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowed = staffHasPermission(staff, "settings.write");
  const canStaff = staffHasPermission(staff, "staff.manage");
  const canAudit = staffHasPermission(staff, "audit.read");
  const canRates = staffHasPermission(staff, "rates.write");
  const [tab, setTab] = useState<SettingsTab>(() => settingsTabFromSearch(searchParams.get("tab")));

  useEffect(() => {
    setTab(settingsTabFromSearch(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  useEffect(() => {
    if (tab === "staff" && !canStaff) {
      setTab("profile");
    }
    if (tab === "rates" && !canRates) {
      setTab("profile");
    }
    if (tab === "audit" && !canAudit) {
      setTab("profile");
    }
  }, [tab, canStaff, canRates, canAudit]);

  if (!allowed) {
    return null;
  }

  const tabs: { id: SettingsTab; label: string; hidden?: boolean }[] = [
    { id: "profile", label: "Shop profile" },
    { id: "staff", label: "Staff", hidden: !canStaff },
    { id: "rates", label: "Daily rates", hidden: !canRates },
    { id: "sequences", label: "Numbering" },
    { id: "devices", label: "Printer and scanner" },
    { id: "reminders", label: "Reminders" },
    { id: "audit", label: "Audit", hidden: !canAudit },
  ];

  const visibleTabs = tabs.filter((item) => !item.hidden);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-display-xs font-semibold text-primary">Settings</h1>
        <p className="text-md text-tertiary">
          Organization, staff, rates, numbering, and reminder preferences for the single Aabhushan shop.
        </p>
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key: Key) => {
          if (typeof key === "string") {
            const next = key as SettingsTab;
            setTab(next);
            const params = new URLSearchParams(searchParams.toString());
            if (next === "profile") {
              params.delete("tab");
            } else {
              params.set("tab", next);
            }
            const query = params.toString();
            router.replace(query ? `/settings?${query}` : "/settings", { scroll: false });
          }
        }}
        className="gap-6"
      >
        <Tabs.List type="button-minimal" size="md" className="flex-wrap" aria-label="Settings sections">
          {visibleTabs.map((item) => (
            <Tabs.Item key={item.id} id={item.id} label={item.label} />
          ))}
        </Tabs.List>

        <Tabs.Panel id="profile">
          <ProfilePanel />
        </Tabs.Panel>
        {canStaff ? (
          <Tabs.Panel id="staff">
            <StaffPanel />
          </Tabs.Panel>
        ) : null}
        {canRates ? (
          <Tabs.Panel id="rates">
            <RatesPanel />
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel id="sequences">
          <SequencesPanel />
        </Tabs.Panel>
        <Tabs.Panel id="devices">
          <DevicesPanel />
        </Tabs.Panel>
        <Tabs.Panel id="reminders">
          <RemindersPanel />
        </Tabs.Panel>
        {canAudit ? (
          <Tabs.Panel id="audit">
            <AuditPanel />
          </Tabs.Panel>
        ) : null}
      </Tabs>
    </section>
  );
}

function ProfilePanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["shop", "profile"],
    queryFn: async () => fetchShopProfile(await accessToken()),
  });
  const [form, setForm] = useState<ShopProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setForm(query.data);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("Profile is not loaded.");
      }
      return patchShopProfile(await accessToken(), {
        legal_name: form.legal_name,
        address_line: form.address_line,
        phone: form.phone,
        invoice_footer: form.invoice_footer,
      });
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(["shop", "profile"], profile);
      void queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setMessage("Shop profile saved.");
    },
  });

  const logoUpload = useMutation({
    mutationFn: async (file: File) => uploadShopLogoRequest(await accessToken(), file),
    onSuccess: (profile) => {
      setForm(profile);
      queryClient.setQueryData(["shop", "profile"], profile);
      void queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setLogoError(null);
      setMessage("Shop logo updated.");
    },
    onError: (error) => {
      setLogoError(errorMessage(error));
    },
  });

  const logoRemove = useMutation({
    mutationFn: async () => removeShopLogoRequest(await accessToken()),
    onSuccess: (profile) => {
      setForm(profile);
      queryClient.setQueryData(["shop", "profile"], profile);
      void queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setLogoError(null);
      setMessage("Shop logo removed.");
    },
    onError: (error) => {
      setLogoError(errorMessage(error));
    },
  });

  if (!form) {
    return <LoadingIndicator size="md" label="Loading shop profile" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <SettingsCard
        title="Shop logo"
        description="Square PNG, JPEG, or WebP (max. 1 MB). High contrast works best on jewellery tags. Logo upload is separate from saving profile fields."
      >
        {form.logo_url ? (
          <div className="flex items-center gap-3">
            <img
              src={form.logo_url}
              alt="Shop logo"
              className="size-16 rounded-lg object-contain ring-1 ring-secondary"
            />
            <Button
              color="secondary"
              size="sm"
              isLoading={logoRemove.isPending}
              onPress={() => {
                setMessage(null);
                logoRemove.mutate();
              }}
            >
              Remove logo
            </Button>
          </div>
        ) : (
          <p className="text-sm text-tertiary">No logo uploaded yet. Tags will print the shop name instead.</p>
        )}
        <FileUpload.Root>
          <FileUpload.DropZone
            className="py-4"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            allowsMultiple={false}
            maxSize={SHOP_LOGO_MAX_BYTES}
            hint={`JPEG, PNG, or WebP (max. ${getReadableFileSize(SHOP_LOGO_MAX_BYTES)}).`}
            onDropFiles={(files) => {
              const file = files[0];
              if (!file) {
                return;
              }
              setMessage(null);
              setLogoError(null);
              logoUpload.mutate(file);
            }}
            onDropUnacceptedFiles={() => {
              setLogoError("Use JPEG, PNG, or WebP.");
            }}
            onSizeLimitExceed={() => {
              setLogoError("Logo is too large. Maximum size is 1 MB.");
            }}
          />
        </FileUpload.Root>
        {logoUpload.isPending ? <p className="text-sm text-tertiary">Uploading logo…</p> : null}
        {logoError ? <p className="text-sm text-error-primary">{logoError}</p> : null}
        {message && !mutation.isPending ? <p className="text-sm text-success-primary">{message}</p> : null}
      </SettingsCard>

      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          mutation.mutate();
        }}
      >
        <SettingsCard title="Shop details" description="Legal name and contact shown on documents and tags.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Legal name"
              value={form.legal_name}
              isRequired
              onChange={(value) => setForm({ ...form, legal_name: value })}
            />
            <Input
              label="Phone"
              value={form.phone ?? ""}
              onChange={(value) => setForm({ ...form, phone: value || null })}
            />
            <div className="md:col-span-2">
              <Input
                label="Address"
                value={form.address_line ?? ""}
                onChange={(value) => setForm({ ...form, address_line: value || null })}
              />
            </div>
            <div className="md:col-span-2">
              <TextArea
                label="Invoice footer"
                value={form.invoice_footer ?? ""}
                onChange={(value) => setForm({ ...form, invoice_footer: value || null })}
              />
            </div>
          </div>
          <p className="text-sm text-tertiary">
            Time zone is {form.time_zone}. Branch: {form.branch.name}.
          </p>
          {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
          {message && mutation.isSuccess ? <p className="text-sm text-success-primary">{message}</p> : null}
          <StickySave>
            <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
              Save profile
            </Button>
          </StickySave>
        </SettingsCard>
      </form>
    </div>
  );
}

function StaffPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitibleStaffRole>("billing");
  const [displayName, setDisplayName] = useState("");

  const query = useQuery({
    queryKey: ["staff", "directory", page, pageSize],
    queryFn: async () => fetchStaffDirectory(await accessToken(), { page, pageSize }),
  });

  const invite = useMutation({
    mutationFn: async () =>
      inviteStaffRequest(await accessToken(), {
        email,
        role,
        ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
      }),
    onSuccess: () => {
      setEmail("");
      setDisplayName("");
      void queryClient.invalidateQueries({ queryKey: ["staff", "directory"] });
    },
  });

  const suspend = useMutation({
    mutationFn: async (staffUserId: string) => suspendStaffRequest(await accessToken(), staffUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["staff", "directory"] });
    },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <SettingsCard title="Invite staff" description="Send an invitation to join this shop. Public signup stays disabled.">
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Invite email" type="email" value={email} isRequired onChange={setEmail} />
            <Input label="Display name (optional)" value={displayName} onChange={setDisplayName} />
            <SelectField
              label="Role"
              value={role}
              onChange={(value) => setRole(value as InvitibleStaffRole)}
              options={[
                { label: "Admin", value: "admin" },
                { label: "Billing", value: "billing" },
                { label: "Inventory", value: "inventory" },
                { label: "Girvi", value: "girvi" },
              ]}
            />
            <div className="flex items-end">
              <Button type="submit" color="primary" size="md" isLoading={invite.isPending}>
                Send invitation
              </Button>
            </div>
          </div>
          {invite.isError ? <p className="text-sm text-error-primary">{errorMessage(invite.error)}</p> : null}
          {invite.isSuccess ? (
            <p className="text-sm text-success-primary">Invitation created for {invite.data.email}.</p>
          ) : null}
        </SettingsCard>
      </form>

      <TableCard.Root>
        <TableCard.Header title="Staff directory" badge={String(total)} />
        <Table aria-label="Staff directory">
          <Table.Header>
            <Table.Head id="name" isRowHeader label="Name" />
            <Table.Head id="email" label="Email" />
            <Table.Head id="role" label="Role" />
            <Table.Head id="status" label="Status" />
            <Table.Head id="actions" label="Actions" />
          </Table.Header>
          <Table.Body items={query.data?.items ?? []}>
            {(item) => (
              <Table.Row id={item.id}>
                <Table.Cell>{item.display_name}</Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-sm text-primary">{item.email}</span>
                </Table.Cell>
                <Table.Cell className="capitalize">{item.role}</Table.Cell>
                <Table.Cell>
                  <Badge type="pill-color" size="sm" color={statusColor(item.status)}>
                    {statusLabel(item.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {item.status === "suspended" ? (
                    <span className="text-sm text-tertiary">Suspended</span>
                  ) : (
                    <Button
                      size="sm"
                      color="secondary-destructive"
                      isDisabled={suspend.isPending}
                      onPress={() => suspend.mutate(item.staff_user_id)}
                    >
                      Suspend
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
        <ListTableFooter
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      </TableCard.Root>
      {suspend.isError ? <p className="text-sm text-error-primary">{errorMessage(suspend.error)}</p> : null}
    </div>
  );
}

function RatesPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [purity, setPurity] = useState("");
  const [rate, setRate] = useState("");
  const [businessDate, setBusinessDate] = useState<CalendarDate | null>(null);

  const query = useQuery({
    queryKey: ["shop", "rates", page, pageSize],
    queryFn: async () => fetchMetalRates(await accessToken(), { page, pageSize }),
  });

  const mutation = useMutation({
    mutationFn: async () =>
      createMetalRateRequest(await accessToken(), {
        metal,
        purity,
        rate_per_gram: rate,
        ...(businessDate ? { effective_business_date: businessDate.toString() } : {}),
      }),
    onSuccess: () => {
      setPurity("");
      setRate("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "rates"] });
    },
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-5">
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <SettingsCard
          title="Add rate"
          description="Existing rows are never rewritten. Leave the date unset to use today's Asia/Kolkata business date."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Metal"
              value={metal}
              onChange={(value) => setMetal(value as "gold" | "silver")}
              options={[
                { label: "Gold", value: "gold" },
                { label: "Silver", value: "silver" },
              ]}
            />
            <Input
              label="Purity"
              value={purity}
              hint="Use the shop's label once confirmed."
              isRequired
              onChange={setPurity}
            />
            <Input label="Rate per gram (₹/g)" value={rate} isRequired onChange={setRate} />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-secondary">Effective business date</p>
              <DatePicker
                value={businessDate}
                onChange={(value) => setBusinessDate(value ? parseDate(value.toString()) : null)}
                aria-label="Effective business date"
              />
            </div>
          </div>
          {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
          {mutation.isSuccess ? (
            <p className="text-sm text-success-primary">Rate stored for {mutation.data.effective_business_date}.</p>
          ) : null}
          <StickySave>
            <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
              Save rate
            </Button>
          </StickySave>
        </SettingsCard>
      </form>

      <TableCard.Root>
        <TableCard.Header title="Metal rates" badge={String(total)} />
        {items.length === 0 && !query.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-tertiary md:px-6">No rates yet. Add a rate above.</p>
        ) : (
          <Table aria-label="Metal rates">
            <Table.Header>
              <Table.Head id="date" isRowHeader label="Business date" />
              <Table.Head id="metal" label="Metal" />
              <Table.Head id="purity" label="Purity" />
              <Table.Head id="rate" label="Rate" className="text-right" />
            </Table.Header>
            <Table.Body items={items}>
              {(item) => (
                <Table.Row id={item.id}>
                  <Table.Cell className="tabular-nums">{item.effective_business_date}</Table.Cell>
                  <Table.Cell className="capitalize">{item.metal}</Table.Cell>
                  <Table.Cell>{item.purity}</Table.Cell>
                  <Table.Cell className="text-right font-medium tabular-nums">₹{item.rate_per_gram}/g</Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        )}
        <ListTableFooter
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
        />
      </TableCard.Root>

      <MakingDefaultsSection />
    </div>
  );
}

function makingChargeLabel(making: {
  method: "fixed" | "per_gram" | "percent_of_metal";
  amount_inr?: string;
  rate_per_gram?: string;
  percent?: string;
}): string {
  if (making.method === "fixed") {
    return `Fixed ₹${making.amount_inr ?? "0"}`;
  }
  if (making.method === "per_gram") {
    return `₹${making.rate_per_gram ?? "0"}/g`;
  }
  return `${making.percent ?? "0"}% of metal`;
}

function MakingDefaultsSection() {
  const queryClient = useQueryClient();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [purity, setPurity] = useState("");
  const [method, setMethod] = useState<"fixed" | "per_gram" | "percent_of_metal">("fixed");
  const [value, setValue] = useState("");

  const query = useQuery({
    queryKey: ["shop", "making-defaults"],
    queryFn: async () => fetchMakingChargeDefaults(await accessToken(), { page: 1, pageSize: 50 }),
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim() || "0";
      const making_charge =
        method === "fixed"
          ? { method: "fixed" as const, amount_inr: trimmed.includes(".") ? trimmed : `${trimmed}.00` }
          : method === "per_gram"
            ? { method: "per_gram" as const, rate_per_gram: trimmed }
            : { method: "percent_of_metal" as const, percent: trimmed };
      return upsertMakingChargeDefaultRequest(await accessToken(), {
        metal,
        purity: purity.trim(),
        making_charge,
      });
    },
    onSuccess: () => {
      setPurity("");
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "making-defaults"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteMakingChargeDefaultRequest(await accessToken(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shop", "making-defaults"] });
    },
  });

  const items = query.data?.items ?? [];

  return (
    <>
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          upsert.mutate();
        }}
      >
        <SettingsCard
          title="Making defaults"
          description="Applied when a new POS line is added for that metal and purity. Staff can still override inline or in Pricing."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Metal"
              value={metal}
              onChange={(next) => setMetal(next as "gold" | "silver")}
              options={[
                { label: "Gold", value: "gold" },
                { label: "Silver", value: "silver" },
              ]}
            />
            <Input label="Purity" value={purity} isRequired onChange={setPurity} />
            <SelectField
              label="Making method"
              value={method}
              onChange={(next) => setMethod(next as "fixed" | "per_gram" | "percent_of_metal")}
              options={[
                { label: "Fixed ₹", value: "fixed" },
                { label: "₹/g", value: "per_gram" },
                { label: "% of metal", value: "percent_of_metal" },
              ]}
            />
            <Input
              label={method === "fixed" ? "Amount (INR)" : method === "per_gram" ? "Rate per gram" : "Percent"}
              value={value}
              isRequired
              onChange={setValue}
            />
          </div>
          {upsert.isError ? <p className="text-sm text-error-primary">{errorMessage(upsert.error)}</p> : null}
          {upsert.isSuccess ? <p className="text-sm text-success-primary">Making default saved.</p> : null}
          <StickySave>
            <Button type="submit" color="primary" size="md" isLoading={upsert.isPending}>
              Save making default
            </Button>
          </StickySave>
        </SettingsCard>
      </form>

      <TableCard.Root>
        <TableCard.Header title="Making defaults" badge={String(items.length)} />
        {items.length === 0 && !query.isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-tertiary md:px-6">
            No making defaults yet. New POS lines stay at ₹0 fixed making until you add one.
          </p>
        ) : (
          <Table aria-label="Making charge defaults">
            <Table.Header>
              <Table.Head id="metal" isRowHeader label="Metal" />
              <Table.Head id="purity" label="Purity" />
              <Table.Head id="making" label="Making" />
              <Table.Head id="actions" label="" className="w-28" />
            </Table.Header>
            <Table.Body items={items}>
              {(item) => (
                <Table.Row id={item.id}>
                  <Table.Cell className="capitalize">{item.metal}</Table.Cell>
                  <Table.Cell>{item.purity}</Table.Cell>
                  <Table.Cell>{makingChargeLabel(item.making_charge)}</Table.Cell>
                  <Table.Cell>
                    <Button
                      color="tertiary-destructive"
                      size="sm"
                      isDisabled={remove.isPending}
                      onPress={() => remove.mutate(item.id)}
                    >
                      Remove
                    </Button>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        )}
      </TableCard.Root>
    </>
  );
}

function SequencesPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["shop", "sequences"],
    queryFn: async () => fetchSequences(await accessToken()),
  });
  const [items, setItems] = useState<DocumentSequence[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setItems(query.data.items);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: async () => patchSequences(await accessToken(), { items }),
    onSuccess: (result) => {
      queryClient.setQueryData(["shop", "sequences"], result);
      setMessage("Numbering saved. Sequences increment only when later specs issue documents.");
    },
  });

  if (items.length === 0) {
    return <LoadingIndicator size="md" label="Loading document sequences" />;
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
      <SettingsCard
        title="Document numbering"
        description="Sequences increment when later specs issue documents."
      >
        <div className="overflow-x-auto">
          <div className="min-w-xl">
            <div className="mb-2 grid grid-cols-4 gap-3 px-1">
              <p className="text-xs font-semibold text-quaternary">Document</p>
              <p className="text-xs font-semibold text-quaternary">Prefix</p>
              <p className="text-xs font-semibold text-quaternary">Padding</p>
              <p className="text-xs font-semibold text-quaternary">Next value</p>
            </div>
            <div className="flex flex-col gap-3">
              {items.map((item, index) => (
                <div key={item.document_type} className="grid grid-cols-4 items-start gap-3">
                  <p className="pt-2.5 text-sm font-medium capitalize text-primary">
                    {item.document_type.replace("_", " ")}
                  </p>
                  <Input
                    aria-label={`${item.document_type} prefix`}
                    value={item.prefix}
                    onChange={(value) => {
                      const next = [...items];
                      const current = next[index];
                      if (current) {
                        next[index] = { ...current, prefix: value };
                        setItems(next);
                      }
                    }}
                  />
                  <Input
                    aria-label={`${item.document_type} padding`}
                    value={String(item.padding)}
                    onChange={(value) => {
                      const next = [...items];
                      const current = next[index];
                      if (current) {
                        next[index] = { ...current, padding: Number.parseInt(value, 10) || 1 };
                        setItems(next);
                      }
                    }}
                  />
                  <Input
                    aria-label={`${item.document_type} next value`}
                    value={String(item.next_value)}
                    onChange={(value) => {
                      const next = [...items];
                      const current = next[index];
                      if (current) {
                        next[index] = { ...current, next_value: Number.parseInt(value, 10) || 1 };
                        setItems(next);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
        {message ? <p className="text-sm text-success-primary">{message}</p> : null}
        <StickySave>
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save numbering
          </Button>
        </StickySave>
      </SettingsCard>
    </form>
  );
}

function DevicesPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["shop", "devices"],
    queryFn: async () => fetchDevices(await accessToken()),
  });
  const [form, setForm] = useState<DeviceSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setForm(query.data);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("Device settings are not loaded.");
      }
      return patchDevices(await accessToken(), {
        scan_terminator: form.scan_terminator,
        expected_suffix: form.expected_suffix,
        tag_width_mm: form.tag_width_mm,
        tag_height_mm: form.tag_height_mm,
        invoice_paper_size: form.invoice_paper_size,
      });
    },
    onSuccess: (devices) => {
      queryClient.setQueryData(["shop", "devices"], devices);
      setMessage("Device defaults saved.");
    },
  });

  if (!form) {
    return <LoadingIndicator size="md" label="Loading device settings" />;
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
      <SettingsCard title="Scanner" description="How barcode scans complete in inventory and POS.">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Scan terminator"
            value={form.scan_terminator}
            onChange={(value) => setForm({ ...form, scan_terminator: value as DeviceSettings["scan_terminator"] })}
            options={[
              { label: "Enter", value: "Enter" },
              { label: "Tab", value: "Tab" },
              { label: "None", value: "None" },
            ]}
          />
          <Input
            label="Expected suffix"
            value={form.expected_suffix}
            onChange={(value) => setForm({ ...form, expected_suffix: value })}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Print sizes"
        description="Printer not confirmed until a physical drill succeeds. A preview is not hardware acceptance."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Tag width (mm)"
            value={form.tag_width_mm}
            onChange={(value) => setForm({ ...form, tag_width_mm: value })}
          />
          <Input
            label="Tag height (mm)"
            value={form.tag_height_mm}
            onChange={(value) => setForm({ ...form, tag_height_mm: value })}
          />
          <SelectField
            label="Invoice paper size"
            value={form.invoice_paper_size}
            onChange={(value) => setForm({ ...form, invoice_paper_size: value as DeviceSettings["invoice_paper_size"] })}
            options={[
              { label: "A5", value: "A5" },
              { label: "A4", value: "A4" },
              { label: "80mm", value: "80mm" },
            ]}
          />
        </div>
        <p className="text-sm text-tertiary">
          Short tags (under about 16 mm height) drop the logo and print the shop name instead so the barcode stays
          tall enough to scan.
        </p>
        {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
        {message ? <p className="text-sm text-success-primary">{message}</p> : null}
        <StickySave>
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save device defaults
          </Button>
        </StickySave>
      </SettingsCard>
    </form>
  );
}

function RemindersPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["shop", "reminders"],
    queryFn: async () => fetchReminders(await accessToken()),
  });
  const [form, setForm] = useState<ReminderSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setForm(query.data);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) {
        throw new Error("Reminder settings are not loaded.");
      }
      return patchReminders(await accessToken(), form);
    },
    onSuccess: (reminders) => {
      queryClient.setQueryData(["shop", "reminders"], reminders);
      setMessage("Reminder preferences saved. Nothing is sent in this unit.");
    },
  });

  if (!form) {
    return <LoadingIndicator size="md" label="Loading reminder preferences" />;
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
      <SettingsCard
        title="Reminder preferences"
        description="Preferences are stored only. WhatsApp sending is a later unit."
      >
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Girvi reminders enabled"
            isSelected={form.girvi_reminders_enabled}
            onChange={(value) => setForm({ ...form, girvi_reminders_enabled: value })}
          />
          <Checkbox
            label="Invoice due reminders enabled"
            isSelected={form.invoice_due_reminders_enabled}
            onChange={(value) => setForm({ ...form, invoice_due_reminders_enabled: value })}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Send window start (Asia/Kolkata)"
            value={form.send_window_start}
            onChange={(value) => setForm({ ...form, send_window_start: value })}
          />
          <Input
            label="Send window end (Asia/Kolkata)"
            value={form.send_window_end}
            onChange={(value) => setForm({ ...form, send_window_end: value })}
          />
          <SelectField
            label="Language"
            value={form.language}
            onChange={(value) => setForm({ ...form, language: value as ReminderSettings["language"] })}
            options={[
              { label: "English", value: "en" },
              { label: "Hindi", value: "hi" },
            ]}
          />
        </div>
        {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
        {message ? <p className="text-sm text-success-primary">{message}</p> : null}
        <StickySave>
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save reminders
          </Button>
        </StickySave>
      </SettingsCard>
    </form>
  );
}

function AuditPanel() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = useQuery({
    queryKey: ["shop", "audit", page, pageSize],
    queryFn: async () => fetchAudit(await accessToken(), { page, pageSize }),
  });
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <TableCard.Root>
      <TableCard.Header
        title="Audit events"
        badge={String(total)}
        description="Staff changes and rate updates are recorded here."
      />
      <Table aria-label="Audit events">
        <Table.Header>
          <Table.Head id="when" isRowHeader label="When" />
          <Table.Head id="action" label="Action" />
          <Table.Head id="entity" label="Entity" />
        </Table.Header>
        <Table.Body items={query.data?.items ?? []}>
          {(item) => (
            <Table.Row id={item.id}>
              <Table.Cell className="tabular-nums text-sm">
                {new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </Table.Cell>
              <Table.Cell>
                <p className="text-sm font-medium text-primary" title={item.action}>
                  {auditActionLabel(item.action)}
                </p>
                <p className="font-mono text-xs text-quaternary">{item.action}</p>
              </Table.Cell>
              <Table.Cell>
                <span className="text-sm capitalize text-primary">{item.entity_type}</span>
                {item.entity_id ? (
                  <span className="ml-1 font-mono text-xs text-quaternary" title={item.entity_id}>
                    · {truncateId(item.entity_id)}
                  </span>
                ) : null}
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>
      <ListTableFooter
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </TableCard.Root>
  );
}
