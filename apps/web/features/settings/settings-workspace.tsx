"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DeviceSettings,
  DocumentSequence,
  InvitibleStaffRole,
  ReminderSettings,
  ShopProfile,
  StaffMembershipStatus,
} from "@aabhushan/contracts";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { Table, TableCard } from "@/components/application/table/table";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SelectField } from "@/components/shared/select-field";
import { TextArea } from "@/components/base/textarea/textarea";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import {
  createMetalRateRequest,
  fetchAudit,
  fetchDevices,
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
} from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { SHOP_LOGO_MAX_BYTES } from "@aabhushan/domain";

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

export function SettingsWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "settings.write");
  const canStaff = staffHasPermission(staff, "staff.manage");
  const canAudit = staffHasPermission(staff, "audit.read");
  const canRates = staffHasPermission(staff, "rates.write");
  const [tab, setTab] = useState<SettingsTab>("profile");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

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

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-display-xs font-semibold text-primary">Settings</h1>
        <p className="text-md text-tertiary">
          Organization, staff, rates, numbering, and reminder preferences for the single Aabhushan shop.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Settings sections">
        {tabs
          .filter((item) => !item.hidden)
          .map((item) => (
            <Button
              key={item.id}
              size="sm"
              color={tab === item.id ? "primary" : "secondary"}
              onPress={() => setTab(item.id)}
            >
              {item.label}
            </Button>
          ))}
      </div>
      {tab === "profile" ? <ProfilePanel /> : null}
      {tab === "staff" && canStaff ? <StaffPanel /> : null}
      {tab === "rates" && canRates ? <RatesPanel /> : null}
      {tab === "sequences" ? <SequencesPanel /> : null}
      {tab === "devices" ? <DevicesPanel /> : null}
      {tab === "reminders" ? <RemindersPanel /> : null}
      {tab === "audit" && canAudit ? <AuditPanel /> : null}
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
      queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setMessage("Shop profile saved.");
    },
  });

  const logoUpload = useMutation({
    mutationFn: async (file: File) => uploadShopLogoRequest(await accessToken(), file),
    onSuccess: (profile) => {
      setForm(profile);
      queryClient.setQueryData(["shop", "profile"], profile);
      queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
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
      queryClient.invalidateQueries({ queryKey: ["shop", "profile"] });
      setLogoError(null);
      setMessage("Shop logo removed.");
    },
    onError: (error) => {
      setLogoError(errorMessage(error));
    },
  });

  if (!form) {
    return <p className="text-sm text-tertiary">Loading shop profile…</p>;
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-primary">Shop logo</h2>
          <p className="mt-1 text-sm text-tertiary">
            Square PNG, JPEG, or WebP (max. 1 MB). High contrast works best on small jewellery tags. Logo upload is
            separate from saving the profile fields below.
          </p>
        </div>
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
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          mutation.mutate();
        }}
      >
        <Input label="Legal name" value={form.legal_name} isRequired onChange={(value) => setForm({ ...form, legal_name: value })} />
        <Input label="Address" value={form.address_line ?? ""} onChange={(value) => setForm({ ...form, address_line: value || null })} />
        <Input label="Phone" value={form.phone ?? ""} onChange={(value) => setForm({ ...form, phone: value || null })} />
        <TextArea
          label="Invoice footer"
          value={form.invoice_footer ?? ""}
          onChange={(value) => setForm({ ...form, invoice_footer: value || null })}
        />
        <p className="text-sm text-tertiary">Time zone is {form.time_zone}. Branch: {form.branch.name}.</p>
        {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
        {message ? <p className="text-sm text-success-primary">{message}</p> : null}
        <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
          Save profile
        </Button>
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

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid max-w-3xl gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
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
      </form>
      {invite.isError ? <p className="text-sm text-error-primary">{errorMessage(invite.error)}</p> : null}
      {invite.isSuccess ? <p className="text-sm text-success-primary">Invitation created for {invite.data.email}.</p> : null}

      <TableCard.Root>
        <TableCard.Header title="Staff directory" />
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
                <Table.Cell>{item.email}</Table.Cell>
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

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid max-w-3xl gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <SelectField
          label="Metal"
          value={metal}
          onChange={(value) => setMetal(value as "gold" | "silver")}
          options={[
            { label: "Gold", value: "gold" },
            { label: "Silver", value: "silver" },
          ]}
        />
        <Input label="Purity" value={purity} hint="Use the shop's label once confirmed." isRequired onChange={setPurity} />
        <Input label="Rate per gram (₹/g)" value={rate} isRequired onChange={setRate} />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-secondary">Effective business date</p>
          <DatePicker
            value={businessDate}
            onChange={(value) => setBusinessDate(value ? parseDate(value.toString()) : null)}
            aria-label="Effective business date"
          />
          <p className="text-xs text-tertiary">Leave unset to use today's Asia/Kolkata business date. Existing rows are never rewritten.</p>
        </div>
        <div className="flex items-end">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save rate
          </Button>
        </div>
      </form>
      {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p className="text-sm text-success-primary">Rate stored for {mutation.data.effective_business_date}.</p> : null}

      <TableCard.Root>
        <TableCard.Header title="Metal rates" />
        <Table aria-label="Metal rates">
          <Table.Header>
            <Table.Head id="date" isRowHeader label="Business date" />
            <Table.Head id="metal" label="Metal" />
            <Table.Head id="purity" label="Purity" />
            <Table.Head id="rate" label="Rate" className="text-right" />
          </Table.Header>
          <Table.Body items={query.data?.items ?? []}>
            {(item) => (
              <Table.Row id={item.id}>
                <Table.Cell>{item.effective_business_date}</Table.Cell>
                <Table.Cell className="capitalize">{item.metal}</Table.Cell>
                <Table.Cell>{item.purity}</Table.Cell>
                <Table.Cell className="text-right font-medium tabular-nums">
                  ₹{item.rate_per_gram}/g
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
    </div>
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
    return <p className="text-sm text-tertiary">Loading document sequences…</p>;
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
      {items.map((item, index) => (
        <div key={item.document_type} className="grid gap-3 md:grid-cols-4">
          <Input label="Document" value={item.document_type.replace("_", " ")} isDisabled />
          <Input
            label="Prefix"
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
            label="Padding"
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
            label="Next value"
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
      {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
      {message ? <p className="text-sm text-success-primary">{message}</p> : null}
      <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
        Save numbering
      </Button>
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
    return <p className="text-sm text-tertiary">Loading device settings…</p>;
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
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
      <Input label="Expected suffix" value={form.expected_suffix} onChange={(value) => setForm({ ...form, expected_suffix: value })} />
      <Input label="Tag width (mm)" value={form.tag_width_mm} onChange={(value) => setForm({ ...form, tag_width_mm: value })} />
      <Input label="Tag height (mm)" value={form.tag_height_mm} onChange={(value) => setForm({ ...form, tag_height_mm: value })} />
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
      <p className="text-sm text-tertiary">
        Printer not confirmed. These millimetre and scanner values stay unverified until a physical drill
        succeeds. A preview is not hardware acceptance. Short tags (under about 16 mm height) drop the logo and
        print the shop name instead so the barcode stays tall enough to scan.
      </p>
      {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
      {message ? <p className="text-sm text-success-primary">{message}</p> : null}
      <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
        Save device defaults
      </Button>
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
    return <p className="text-sm text-tertiary">Loading reminder preferences…</p>;
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        mutation.mutate();
      }}
    >
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
      <p className="text-sm text-tertiary">Preferences are stored only. WhatsApp sending is a later unit.</p>
      {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
      {message ? <p className="text-sm text-success-primary">{message}</p> : null}
      <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
        Save reminders
      </Button>
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
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));

  return (
    <TableCard.Root>
      <TableCard.Header title="Audit events" description="Staff changes and rate updates are recorded here." />
      <Table aria-label="Audit events">
        <Table.Header>
          <Table.Head id="when" isRowHeader label="When" />
          <Table.Head id="action" label="Action" />
          <Table.Head id="entity" label="Entity" />
        </Table.Header>
        <Table.Body items={query.data?.items ?? []}>
          {(item) => (
            <Table.Row id={item.id}>
              <Table.Cell>{new Date(item.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</Table.Cell>
              <Table.Cell>{item.action}</Table.Cell>
              <Table.Cell>
                {item.entity_type}
                {item.entity_id ? ` · ${item.entity_id}` : ""}
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
