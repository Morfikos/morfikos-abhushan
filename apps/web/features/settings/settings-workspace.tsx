"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type Key,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  DeviceSettings,
  DocumentSequence,
  InvitibleStaffRole,
  ReminderSettings,
  ShopProfile,
  StaffDirectoryItem,
} from "@aabhushan/contracts";
import { SHOP_LOGO_MAX_BYTES } from "@aabhushan/domain";
import { Settings01 } from "@untitledui/icons";

import { DatePicker } from "@/components/application/date-picker/date-picker";
import { FileUpload, getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { FormSkeleton, SequencesFormSkeleton, TableSkeleton } from "@/components/application/skeleton/skeleton";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { useStaffToast } from "@/components/application/toast/staff-toast";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CatalogueCombobox } from "@/components/shared/catalogue-combobox";
import { ListTableFooter } from "@/components/shared/list-table-footer";
import { SectionCard } from "@/components/shared/section-card";
import { SelectField } from "@/components/shared/select-field";
import { StaffPageHeader } from "@/components/shared/staff-page-header";
import { StickyFormActions } from "@/components/shared/sticky-form-actions";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { membershipStatusColor, membershipStatusLabel } from "./membership-status";
import {
  createMetalRateRequest,
  createPurityLabelRequest,
  createStorageLocationRequest,
  deleteMakingChargeDefaultRequest,
  fetchAudit,
  fetchDevices,
  fetchMakingChargeDefaults,
  fetchMetalRates,
  fetchPurityLabels,
  fetchReminders,
  fetchSequences,
  fetchShopProfile,
  fetchStaffDirectory,
  fetchStorageLocations,
  inviteStaffRequest,
  patchDevices,
  patchPurityLabelRequest,
  patchReminders,
  patchSequences,
  patchShopProfile,
  patchStorageLocationRequest,
  removeShopLogoRequest,
  StaffApiError,
  suspendStaffRequest,
  uploadShopLogoRequest,
  upsertMakingChargeDefaultRequest,
} from "@/lib/staff-api";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { MoneyText } from "@/components/shared/money-text";
import { formatInr } from "@/lib/money";

type SettingsTab =
  | "profile"
  | "staff"
  | "rates"
  | "catalogues"
  | "sequences"
  | "devices"
  | "reminders"
  | "audit";

async function accessToken(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new StaffApiError(401, "AUTH_INVALID", "Sign in is required.");
  }
  return token;
}

function errorMessage(error: unknown, preferredField?: string): string {
  if (error instanceof StaffApiError) {
    if (preferredField) {
      const match = error.fieldErrors.find((item) => item.field === preferredField);
      if (match) {
        return match.message;
      }
    }
    return error.message;
  }
  return "The request failed. Try again.";
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
  "catalogues",
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

type PanelDirtyState = {
  dirty: boolean;
  savePending: boolean;
};

const SettingsDirtyContext = createContext<{
  reportDirty: (panelId: SettingsTab, state: PanelDirtyState) => void;
} | null>(null);

function useReportSettingsDirty(panelId: SettingsTab, dirty: boolean, savePending: boolean) {
  const context = useContext(SettingsDirtyContext);
  useEffect(() => {
    context?.reportDirty(panelId, { dirty, savePending });
    return () => {
      context?.reportDirty(panelId, { dirty: false, savePending: false });
    };
  }, [context, dirty, panelId, savePending]);
}

const SHOP_LOGO_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

function isShopLogoTypeAccepted(file: File): boolean {
  const acceptedTypes = SHOP_LOGO_ACCEPT.split(",").map((type) => type.trim());
  return acceptedTypes.some((acceptedType) => {
    if (acceptedType.startsWith(".")) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      return extension === acceptedType.toLowerCase();
    }
    return file.type === acceptedType;
  });
}

function acceptShopLogoFile(file: File): { ok: true; file: File } | { ok: false; error: string } {
  if (file.size > SHOP_LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo is too large. Maximum size is 1 MB." };
  }
  if (!isShopLogoTypeAccepted(file)) {
    return { ok: false, error: "Use JPEG, PNG, or WebP." };
  }
  return { ok: true, file };
}

function profileFieldsDirty(form: ShopProfile, saved: ShopProfile): boolean {
  return (
    form.legal_name !== saved.legal_name ||
    (form.address_line ?? "") !== (saved.address_line ?? "") ||
    (form.phone ?? "") !== (saved.phone ?? "") ||
    (form.invoice_footer ?? "") !== (saved.invoice_footer ?? "")
  );
}

function sequencesDirty(items: DocumentSequence[], saved: DocumentSequence[]): boolean {
  if (items.length !== saved.length) {
    return true;
  }
  return items.some((item, index) => {
    const baseline = saved[index];
    if (!baseline) {
      return true;
    }
    return (
      item.prefix !== baseline.prefix ||
      item.padding !== baseline.padding ||
      item.next_value !== baseline.next_value
    );
  });
}

function deviceFieldsDirty(form: DeviceSettings, saved: DeviceSettings): boolean {
  return (
    form.scan_terminator !== saved.scan_terminator ||
    form.expected_suffix !== saved.expected_suffix ||
    form.tag_width_mm !== saved.tag_width_mm ||
    form.tag_height_mm !== saved.tag_height_mm ||
    form.invoice_paper_size !== saved.invoice_paper_size
  );
}

function reminderFieldsDirty(form: ReminderSettings, saved: ReminderSettings): boolean {
  return (
    form.girvi_reminders_enabled !== saved.girvi_reminders_enabled ||
    form.invoice_due_reminders_enabled !== saved.invoice_due_reminders_enabled ||
    form.send_window_start !== saved.send_window_start ||
    form.send_window_end !== saved.send_window_end ||
    form.language !== saved.language
  );
}

/** Body-only Suspense fallback (header stays live outside). */
export function SettingsBodyLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading settings</span>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-9 w-24 animate-pulse rounded-lg bg-tertiary" />
        ))}
      </div>
      <FormSkeleton sections={2} showStickyActions label="Loading settings" />
    </div>
  );
}

export function SettingsWorkspace() {
  const staff = useStaff();
  const router = useRouter();
  const allowed = staffHasPermission(staff, "settings.write");
  const canStaff = staffHasPermission(staff, "staff.manage");
  const canAudit = staffHasPermission(staff, "audit.read");
  const canRates = staffHasPermission(staff, "rates.write");
  const canCatalogues = staffHasPermission(staff, "inventory.write");

  useEffect(() => {
    if (!allowed) {
      router.replace("/access-denied");
    }
  }, [allowed, router]);

  if (!allowed) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <StaffPageHeader
        title="Settings"
        description="Organization, staff, rates, numbering, and reminder preferences for the single Aabhushan shop."
        icon={Settings01}
      />
      <Suspense fallback={<SettingsBodyLoading />}>
        <SettingsWorkspaceBody
          canStaff={canStaff}
          canAudit={canAudit}
          canRates={canRates}
          canCatalogues={canCatalogues}
        />
      </Suspense>
    </section>
  );
}

function SettingsWorkspaceBody({
  canStaff,
  canAudit,
  canRates,
  canCatalogues,
}: {
  canStaff: boolean;
  canAudit: boolean;
  canRates: boolean;
  canCatalogues: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => settingsTabFromSearch(searchParams.get("tab")));
  const [panelStates, setPanelStates] = useState<Partial<Record<SettingsTab, PanelDirtyState>>>({});
  const [tabDiscardOpen, setTabDiscardOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const [resetNonce, setResetNonce] = useState<Partial<Record<SettingsTab, number>>>({});

  const reportDirty = useCallback((panelId: SettingsTab, state: PanelDirtyState) => {
    setPanelStates((current) => ({ ...current, [panelId]: state }));
  }, []);

  const dirtyContextValue = useMemo(() => ({ reportDirty }), [reportDirty]);

  const applyTab = useCallback(
    (next: SettingsTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "profile") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const query = params.toString();
      router.replace(query ? `/settings?${query}` : "/settings", { scroll: false });
    },
    [router, searchParams],
  );

  const requestTab = useCallback(
    (next: SettingsTab) => {
      if (next === tab) {
        return;
      }
      const current = panelStates[tab];
      if (current?.dirty && !current.savePending) {
        setPendingTab(next);
        setTabDiscardOpen(true);
        return;
      }
      applyTab(next);
    },
    [applyTab, panelStates, tab],
  );

  useEffect(() => {
    const urlTab = settingsTabFromSearch(searchParams.get("tab"));
    if (urlTab === tab) {
      return;
    }
    const current = panelStates[tab];
    if (current?.dirty && !current.savePending) {
      applyTab(tab);
      setPendingTab(urlTab);
      setTabDiscardOpen(true);
      return;
    }
    setTab(urlTab);
  }, [applyTab, panelStates, searchParams, tab]);

  useEffect(() => {
    if (tab === "staff" && !canStaff) {
      setTab("profile");
    }
    if (tab === "rates" && !canRates) {
      setTab("profile");
    }
    if (tab === "catalogues" && !canCatalogues) {
      setTab("profile");
    }
    if (tab === "audit" && !canAudit) {
      setTab("profile");
    }
  }, [tab, canStaff, canRates, canCatalogues, canAudit]);

  const tabs: { id: SettingsTab; label: string; hidden?: boolean }[] = [
    { id: "profile", label: "Shop profile" },
    { id: "staff", label: "Staff", hidden: !canStaff },
    { id: "rates", label: "Daily rates", hidden: !canRates },
    { id: "catalogues", label: "Catalogues", hidden: !canCatalogues },
    { id: "sequences", label: "Numbering" },
    { id: "devices", label: "Printer and scanner" },
    { id: "reminders", label: "Reminders" },
    { id: "audit", label: "Audit", hidden: !canAudit },
  ];

  const visibleTabs = tabs.filter((item) => !item.hidden);

  return (
    <>
      <SettingsDirtyContext.Provider value={dirtyContextValue}>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key: Key) => {
            if (typeof key === "string") {
              requestTab(key as SettingsTab);
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
            <ProfilePanel key={`profile-${resetNonce.profile ?? 0}`} />
          </Tabs.Panel>
          {canStaff ? (
            <Tabs.Panel id="staff">
              <StaffPanel />
            </Tabs.Panel>
          ) : null}
          {canRates ? (
            <Tabs.Panel id="rates">
              <RatesPanel key={`rates-${resetNonce.rates ?? 0}`} />
            </Tabs.Panel>
          ) : null}
          {canCatalogues ? (
            <Tabs.Panel id="catalogues">
              <CataloguesPanel />
            </Tabs.Panel>
          ) : null}
          <Tabs.Panel id="sequences">
            <SequencesPanel key={`sequences-${resetNonce.sequences ?? 0}`} />
          </Tabs.Panel>
          <Tabs.Panel id="devices">
            <DevicesPanel key={`devices-${resetNonce.devices ?? 0}`} />
          </Tabs.Panel>
          <Tabs.Panel id="reminders">
            <RemindersPanel key={`reminders-${resetNonce.reminders ?? 0}`} />
          </Tabs.Panel>
          {canAudit ? (
            <Tabs.Panel id="audit">
              <AuditPanel />
            </Tabs.Panel>
          ) : null}
        </Tabs>

        <ConfirmDialog
          isOpen={tabDiscardOpen}
          title="Discard changes?"
          message="Unsaved edits on this settings tab will be lost."
          confirmLabel="Discard"
          confirmColor="primary-destructive"
          cancelLabel="Keep editing"
          onConfirm={() => {
            const leaving = tab;
            const next = pendingTab;
            setTabDiscardOpen(false);
            setPendingTab(null);
            setPanelStates((current) => ({ ...current, [leaving]: { dirty: false, savePending: false } }));
            setResetNonce((current) => ({ ...current, [leaving]: (current[leaving] ?? 0) + 1 }));
            if (next) {
              applyTab(next);
            }
          }}
          onCancel={() => {
            setTabDiscardOpen(false);
            setPendingTab(null);
          }}
        />
      </SettingsDirtyContext.Provider>
    </>
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
  const [previewDragging, setPreviewDragging] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

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

  const profileDirty = form && query.data ? profileFieldsDirty(form, query.data) : false;
  useReportSettingsDirty("profile", profileDirty, mutation.isPending);

  const logoBusy = logoUpload.isPending || logoRemove.isPending;

  const submitLogoFile = useCallback(
    (file: File) => {
      const result = acceptShopLogoFile(file);
      if (!result.ok) {
        setLogoError(result.error);
        return;
      }
      setMessage(null);
      setLogoError(null);
      logoUpload.mutate(result.file);
    },
    [logoUpload],
  );

  if (!form) {
    return <FormSkeleton sections={2} fieldsPerSection={4} showStickyActions label="Loading shop profile" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <SectionCard
        title="Shop logo"
        description="High contrast works best on jewellery tags. Logo updates immediately; it is not part of Save profile."
      >
        {form.logo_url ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className={`relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary ring-1 ring-inset ${
                previewDragging ? "ring-2 ring-brand" : "ring-secondary"
              } ${logoBusy ? "opacity-60" : ""}`}
              onDragEnter={(event: DragEvent) => {
                if (logoBusy) return;
                event.preventDefault();
                event.stopPropagation();
                setPreviewDragging(true);
              }}
              onDragOver={(event: DragEvent) => {
                if (logoBusy) return;
                event.preventDefault();
                event.stopPropagation();
                setPreviewDragging(true);
              }}
              onDragLeave={(event: DragEvent) => {
                event.preventDefault();
                event.stopPropagation();
                setPreviewDragging(false);
              }}
              onDrop={(event: DragEvent) => {
                if (logoBusy) return;
                event.preventDefault();
                event.stopPropagation();
                setPreviewDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) {
                  submitLogoFile(file);
                }
              }}
            >
              <img src={form.logo_url} alt="Shop logo" className="size-full object-contain p-2" />
              {previewDragging ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/80 px-2 text-center text-xs font-medium text-brand-secondary">
                  Drop to replace
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-sm text-tertiary">Uploading a new file replaces the current logo.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={replaceInputRef}
                  type="file"
                  className="sr-only"
                  accept={SHOP_LOGO_ACCEPT}
                  disabled={logoBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) {
                      submitLogoFile(file);
                    }
                  }}
                />
                <Button
                  color="secondary"
                  size="sm"
                  isDisabled={logoBusy && !logoUpload.isPending}
                  isLoading={logoUpload.isPending}
                  onPress={() => replaceInputRef.current?.click()}
                >
                  Replace logo
                </Button>
                <Button
                  color="secondary"
                  size="sm"
                  isDisabled={logoBusy && !logoRemove.isPending}
                  isLoading={logoRemove.isPending}
                  onPress={() => {
                    setMessage(null);
                    setLogoError(null);
                    logoRemove.mutate();
                  }}
                >
                  Remove logo
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <FileUpload.Root>
              <FileUpload.DropZone
                className="py-4"
                accept={SHOP_LOGO_ACCEPT}
                allowsMultiple={false}
                maxSize={SHOP_LOGO_MAX_BYTES}
                isDisabled={logoBusy}
                hint={`JPEG, PNG, or WebP (max. ${getReadableFileSize(SHOP_LOGO_MAX_BYTES)}).`}
                onDropFiles={(files) => {
                  const file = files[0];
                  if (!file) {
                    return;
                  }
                  submitLogoFile(file);
                }}
                onDropUnacceptedFiles={() => {
                  setLogoError("Use JPEG, PNG, or WebP.");
                }}
                onSizeLimitExceed={() => {
                  setLogoError("Logo is too large. Maximum size is 1 MB.");
                }}
              />
            </FileUpload.Root>
            <p className="text-sm text-tertiary">No logo yet. Tags print the shop name instead.</p>
          </div>
        )}
        {logoError ? <p className="text-sm text-error-primary">{logoError}</p> : null}
        {message && !mutation.isPending ? <p className="text-sm text-success-primary">{message}</p> : null}
      </SectionCard>

      <form
        className="flex flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          mutation.mutate();
        }}
      >
        <SectionCard title="Shop details" description="Legal name and contact shown on documents and tags.">
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
          <StickyFormActions variant="inset">
            <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
              Save profile
            </Button>
          </StickyFormActions>
        </SectionCard>
      </form>
    </div>
  );
}

function inviteEmailFieldHint(error: unknown): string | undefined {
  if (!(error instanceof StaffApiError)) {
    return undefined;
  }
  const field = error.fieldErrors.find((item) => item.field === "email");
  if (field) {
    return field.message;
  }
  if (error.code === "STAFF_EXISTS" || /email/i.test(error.message)) {
    return error.message;
  }
  return undefined;
}

function StaffPanel() {
  const queryClient = useQueryClient();
  const me = useStaff();
  const toast = useStaffToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitibleStaffRole>("billing");
  const [displayName, setDisplayName] = useState("");
  const [suspendTarget, setSuspendTarget] = useState<StaffDirectoryItem | null>(null);

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
    onSuccess: (data) => {
      setEmail("");
      setDisplayName("");
      toast.success(`Invitation sent to ${data.email}.`);
      void queryClient.invalidateQueries({ queryKey: ["staff", "directory"] });
    },
  });

  const suspend = useMutation({
    mutationFn: async (staffUserId: string) => suspendStaffRequest(await accessToken(), staffUserId),
    onSuccess: (data) => {
      setSuspendTarget(null);
      toast.success(`Suspended ${data.display_name}.`);
      void queryClient.invalidateQueries({ queryKey: ["staff", "directory"] });
    },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const inviteEmailHint = invite.isError ? inviteEmailFieldHint(invite.error) : undefined;
  const inviteFormError =
    invite.isError && !inviteEmailHint ? errorMessage(invite.error) : null;

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <SectionCard title="Invite staff" description="Send an invitation to join this shop. Public signup stays disabled.">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(10rem,12rem)_auto] lg:items-start">
            <Input
              label="Invite email"
              type="email"
              value={email}
              isRequired
              isInvalid={Boolean(inviteEmailHint)}
              hint={inviteEmailHint}
              onChange={(value) => {
                if (invite.isError) {
                  invite.reset();
                }
                setEmail(value);
              }}
            />
            <Input
              label="Display name (optional)"
              value={displayName}
              onChange={(value) => {
                if (invite.isError) {
                  invite.reset();
                }
                setDisplayName(value);
              }}
            />
            <SelectField
              label="Role"
              hint="Admin: settings and staff. Billing: POS and payments. Inventory: stock and tags. Girvi: collateral accounts."
              value={role}
              onChange={(value) => setRole(value as InvitibleStaffRole)}
              options={[
                { label: "Admin", value: "admin" },
                { label: "Billing", value: "billing" },
                { label: "Inventory", value: "inventory" },
                { label: "Girvi", value: "girvi" },
              ]}
            />
            <div className="flex items-end lg:pt-7">
              <Button type="submit" color="primary" size="md" isLoading={invite.isPending}>
                Send invitation
              </Button>
            </div>
          </div>
          {inviteFormError ? <p className="text-sm text-error-primary">{inviteFormError}</p> : null}
        </SectionCard>
      </form>

      <TableCard.Root>
        <TableCard.Header title="Staff directory" badge={query.isLoading ? undefined : String(total)} />
        {query.isLoading && !query.data ? (
          <TableSkeleton columns={5} rows={6} showCard={false} label="Loading staff directory" />
        ) : (
        <Table aria-label="Staff directory">
          <Table.Header>
            <Table.Head id="name" isRowHeader label="Name" />
            <Table.Head id="email" label="Email" />
            <Table.Head id="role" label="Role" />
            <Table.Head id="status" label="Status" />
            <Table.Head id="actions" label="Actions" />
          </Table.Header>
          <Table.Body items={query.data?.items ?? []}>
            {(item) => {
              const isSelf = item.staff_user_id === me.staff_user_id;
              const isOwner = item.role === "owner";
              const canSuspend = item.status !== "suspended" && !isSelf && !isOwner;

              return (
              <Table.Row id={item.id}>
                <Table.Cell>{item.display_name}</Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-sm text-primary">{item.email}</span>
                </Table.Cell>
                <Table.Cell className="capitalize">{item.role}</Table.Cell>
                <Table.Cell>
                  <Badge type="pill-color" size="sm" color={membershipStatusColor(item.status)}>
                    {membershipStatusLabel(item.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell truncate={false}>
                  {item.status === "suspended" ? (
                    <span className="text-sm text-tertiary">Suspended</span>
                  ) : canSuspend ? (
                    <Button
                      size="sm"
                      color="secondary-destructive"
                      isDisabled={suspend.isPending}
                      onPress={() => setSuspendTarget(item)}
                    >
                      Suspend
                    </Button>
                  ) : (
                    <span className="text-sm text-tertiary">{isOwner ? "Protected" : "—"}</span>
                  )}
                </Table.Cell>
              </Table.Row>
              );
            }}
          </Table.Body>
        </Table>
        )}
        {!query.isLoading || query.data ? (
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
        ) : null}
      </TableCard.Root>

      <ConfirmDialog
        isOpen={suspendTarget !== null}
        title="Suspend staff?"
        message={
          suspendTarget ? (
            <>
              Suspend <span className="font-medium text-primary">{suspendTarget.display_name}</span> (
              <span className="font-mono text-primary">{suspendTarget.email}</span>)? They will lose access until
              restored.
              {suspend.isError ? (
                <p className="mt-2 text-sm text-error-primary">{errorMessage(suspend.error)}</p>
              ) : null}
            </>
          ) : null
        }
        confirmLabel="Suspend"
        confirmColor="primary-destructive"
        cancelLabel="Cancel"
        isConfirming={suspend.isPending}
        onConfirm={() => {
          if (!suspendTarget) {
            return;
          }
          suspend.mutate(suspendTarget.staff_user_id);
        }}
        onCancel={() => {
          if (!suspend.isPending) {
            setSuspendTarget(null);
            suspend.reset();
          }
        }}
      />
    </div>
  );
}

function CataloguesPanel() {
  return (
    <div className="flex flex-col gap-5 xl:grid xl:grid-cols-2 xl:items-start xl:gap-5">
      <PuritiesCatalogueSection />
      <StorageLocationsCatalogueSection />
    </div>
  );
}

const PURITY_STARTERS = ["22K", "18K", "14K", "916"] as const;
const LOCATION_STARTERS = ["Safe A", "Counter", "Tray 1"] as const;

function CatalogueStarterChips({
  suggestions,
  disabled,
  onPick,
}: {
  suggestions: readonly string[];
  disabled?: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-secondary px-4 pb-4 md:px-6">
      <p className="text-xs text-tertiary">Suggestions</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            color="secondary"
            size="sm"
            isDisabled={disabled}
            onPress={() => onPick(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PuritiesCatalogueSection() {
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const query = useQuery({
    queryKey: ["shop", "purity-labels", { includeInactive: true }],
    queryFn: async () => fetchPurityLabels(await accessToken(), { includeInactive: true }),
  });

  const create = useMutation({
    mutationFn: async () => createPurityLabelRequest(await accessToken(), { label: newLabel.trim() }),
    onSuccess: () => {
      setNewLabel("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "purity-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "purity-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["purity-labels"] });
    },
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; label?: string; is_active?: boolean }) =>
      patchPurityLabelRequest(await accessToken(), input.id, {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditValue("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "purity-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "purity-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["purity-labels"] });
    },
  });

  const items = query.data?.items ?? [];
  const busy = create.isPending || patch.isPending;
  const createHint = create.isError ? errorMessage(create.error, "label") : undefined;
  const empty = !query.isLoading && items.length === 0;

  function submitCreate() {
    if (!newLabel.trim() || busy) {
      return;
    }
    create.mutate();
  }

  return (
    <TableCard.Root>
      <TableCard.Header
        title="Purities"
        description="Labels used on rates, making defaults, and article receive. Archive unused labels instead of deleting them."
        badge={query.isLoading && items.length === 0 ? undefined : String(items.length)}
      />
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:flex-row md:items-end md:px-6">
        <div className="min-w-0 flex-1">
          <Input
            label="New purity label"
            value={newLabel}
            placeholder="e.g. 22K"
            isDisabled={busy}
            isInvalid={create.isError}
            hint={createHint}
            onChange={(value) => {
              if (create.isError) {
                create.reset();
              }
              setNewLabel(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitCreate();
              }
            }}
          />
        </div>
        <Button
          color="primary"
          size="md"
          isLoading={create.isPending}
          isDisabled={!newLabel.trim() || busy}
          onPress={submitCreate}
        >
          Add
        </Button>
      </div>
      {empty ? (
        <CatalogueStarterChips
          suggestions={PURITY_STARTERS}
          disabled={busy}
          onPick={(value) => {
            if (create.isError) {
              create.reset();
            }
            setNewLabel(value);
          }}
        />
      ) : null}
      {patch.isError ? (
        <p className="px-4 pt-3 text-sm text-error-primary md:px-6">{errorMessage(patch.error, "label")}</p>
      ) : null}
      {query.isLoading && items.length === 0 ? (
        <TableSkeleton columns={3} rows={5} showCard={false} label="Loading purities" />
      ) : empty ? (
        <p className="px-4 py-5 text-center text-sm text-tertiary md:px-6">
          No purity labels yet. Add your first purity above, or pick a suggestion.
        </p>
      ) : (
        <Table aria-label="Purity labels">
          <Table.Header>
            <Table.Head id="label" isRowHeader label="Label" />
            <Table.Head id="status" label="Status" />
            <Table.Head id="actions" label="" className="w-56" />
          </Table.Header>
          <Table.Body items={items}>
            {(item) => (
              <Table.Row id={item.id}>
                <Table.Cell truncate={false}>
                  {editingId === item.id ? (
                    <Input
                      aria-label="Rename purity label"
                      value={editValue}
                      isDisabled={busy}
                      onChange={setEditValue}
                    />
                  ) : (
                    item.label
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge type="pill-color" size="sm" color={item.is_active ? "success" : "gray"}>
                    {item.is_active ? "Active" : "Archived"}
                  </Badge>
                </Table.Cell>
                <Table.Cell truncate={false}>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {editingId === item.id ? (
                      <>
                        <Button
                          color="primary"
                          size="sm"
                          isLoading={patch.isPending}
                          isDisabled={!editValue.trim() || editValue.trim() === item.label || busy}
                          onPress={() => patch.mutate({ id: item.id, label: editValue.trim() })}
                        >
                          Save
                        </Button>
                        <Button
                          color="tertiary"
                          size="sm"
                          isDisabled={busy}
                          onPress={() => {
                            setEditingId(null);
                            setEditValue("");
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          color="tertiary"
                          size="sm"
                          isDisabled={busy}
                          onPress={() => {
                            setEditingId(item.id);
                            setEditValue(item.label);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          color={item.is_active ? "secondary-destructive" : "secondary"}
                          size="sm"
                          isDisabled={busy}
                          onPress={() => patch.mutate({ id: item.id, is_active: !item.is_active })}
                        >
                          {item.is_active ? "Archive" : "Restore"}
                        </Button>
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}
    </TableCard.Root>
  );
}

function StorageLocationsCatalogueSection() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const query = useQuery({
    queryKey: ["shop", "storage-locations", { includeInactive: true }],
    queryFn: async () => fetchStorageLocations(await accessToken(), { includeInactive: true }),
  });

  const create = useMutation({
    mutationFn: async () => createStorageLocationRequest(await accessToken(), { name: newName.trim() }),
    onSuccess: () => {
      setNewName("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "storage-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "locations"] });
      void queryClient.invalidateQueries({ queryKey: ["storage-locations"] });
    },
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; name?: string; is_active?: boolean }) =>
      patchStorageLocationRequest(await accessToken(), input.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditValue("");
      void queryClient.invalidateQueries({ queryKey: ["shop", "storage-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory", "locations"] });
      void queryClient.invalidateQueries({ queryKey: ["storage-locations"] });
    },
  });

  const items = query.data?.items ?? [];
  const busy = create.isPending || patch.isPending;
  const createHint = create.isError ? errorMessage(create.error, "name") : undefined;
  const empty = !query.isLoading && items.length === 0;

  function submitCreate() {
    if (!newName.trim() || busy) {
      return;
    }
    create.mutate();
  }

  return (
    <TableCard.Root>
      <TableCard.Header
        title="Storage locations"
        description="Safe, tray, or shelf names used when receiving and adjusting stock. Archive locations that are no longer used."
        badge={query.isLoading && items.length === 0 ? undefined : String(items.length)}
      />
      <div className="flex flex-col gap-3 border-b border-secondary px-4 py-4 md:flex-row md:items-end md:px-6">
        <div className="min-w-0 flex-1">
          <Input
            label="New storage location"
            value={newName}
            placeholder="e.g. Safe A"
            isDisabled={busy}
            isInvalid={create.isError}
            hint={createHint}
            onChange={(value) => {
              if (create.isError) {
                create.reset();
              }
              setNewName(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitCreate();
              }
            }}
          />
        </div>
        <Button
          color="primary"
          size="md"
          isLoading={create.isPending}
          isDisabled={!newName.trim() || busy}
          onPress={submitCreate}
        >
          Add
        </Button>
      </div>
      {empty ? (
        <CatalogueStarterChips
          suggestions={LOCATION_STARTERS}
          disabled={busy}
          onPick={(value) => {
            if (create.isError) {
              create.reset();
            }
            setNewName(value);
          }}
        />
      ) : null}
      {patch.isError ? (
        <p className="px-4 pt-3 text-sm text-error-primary md:px-6">{errorMessage(patch.error, "name")}</p>
      ) : null}
      {query.isLoading && items.length === 0 ? (
        <TableSkeleton columns={3} rows={5} showCard={false} label="Loading storage locations" />
      ) : empty ? (
        <p className="px-4 py-5 text-center text-sm text-tertiary md:px-6">
          No storage locations yet. Add your first location above, or pick a suggestion.
        </p>
      ) : (
        <Table aria-label="Storage locations">
          <Table.Header>
            <Table.Head id="name" isRowHeader label="Name" />
            <Table.Head id="status" label="Status" />
            <Table.Head id="actions" label="" className="w-56" />
          </Table.Header>
          <Table.Body items={items}>
            {(item) => (
              <Table.Row id={item.id}>
                <Table.Cell truncate={false}>
                  {editingId === item.id ? (
                    <Input
                      aria-label="Rename storage location"
                      value={editValue}
                      isDisabled={busy}
                      onChange={setEditValue}
                    />
                  ) : (
                    item.name
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Badge type="pill-color" size="sm" color={item.is_active ? "success" : "gray"}>
                    {item.is_active ? "Active" : "Archived"}
                  </Badge>
                </Table.Cell>
                <Table.Cell truncate={false}>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {editingId === item.id ? (
                      <>
                        <Button
                          color="primary"
                          size="sm"
                          isLoading={patch.isPending}
                          isDisabled={!editValue.trim() || editValue.trim() === item.name || busy}
                          onPress={() => patch.mutate({ id: item.id, name: editValue.trim() })}
                        >
                          Save
                        </Button>
                        <Button
                          color="tertiary"
                          size="sm"
                          isDisabled={busy}
                          onPress={() => {
                            setEditingId(null);
                            setEditValue("");
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          color="tertiary"
                          size="sm"
                          isDisabled={busy}
                          onPress={() => {
                            setEditingId(item.id);
                            setEditValue(item.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          color={item.is_active ? "secondary-destructive" : "secondary"}
                          size="sm"
                          isDisabled={busy}
                          onPress={() => patch.mutate({ id: item.id, is_active: !item.is_active })}
                        >
                          {item.is_active ? "Archive" : "Restore"}
                        </Button>
                      </>
                    )}
                  </div>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}
    </TableCard.Root>
  );
}

function RatesPanel() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [purity, setPurity] = useState("");
  const [rate, setRate] = useState("");
  const [businessDate, setBusinessDate] = useState<CalendarDate | null>(null);
  const [makingDirty, setMakingDirty] = useState(false);
  const [makingSavePending, setMakingSavePending] = useState(false);

  const query = useQuery({
    queryKey: ["shop", "rates", page, pageSize],
    queryFn: async () => fetchMetalRates(await accessToken(), { page, pageSize }),
  });

  const purities = useQuery({
    queryKey: ["shop", "purity-labels"],
    queryFn: async () => fetchPurityLabels(await accessToken()),
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
  const purityItems = (purities.data?.items ?? []).map((item) => ({ id: item.label, label: item.label }));
  const addRateDirty = purity.trim() !== "" || rate.trim() !== "" || businessDate !== null;
  useReportSettingsDirty("rates", addRateDirty || makingDirty, mutation.isPending || makingSavePending);

  return (
    <div className="flex flex-col gap-5">
      <form
        className="w-full"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <SectionCard
          title="Add rate"
          description="New rates are added; old ones stay for history. Leave date blank for today."
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
            <div className="flex flex-col gap-1.5">
              <CatalogueCombobox
                label="Purity"
                value={purity}
                placeholder="Select purity"
                isRequired
                isDisabled={purities.isLoading}
                items={purityItems}
                onChange={setPurity}
              />
              {!purities.isLoading && purityItems.length === 0 ? (
                <p className="text-sm text-tertiary">
                  No purities yet.{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-secondary hover:underline"
                    onClick={() => router.replace("/settings?tab=catalogues", { scroll: false })}
                  >
                    Add purities in Catalogues
                  </button>
                </p>
              ) : null}
            </div>
            <Input
              label="Rate per gram (₹/g)"
              value={rate}
              placeholder="e.g. 6500"
              isRequired
              onChange={setRate}
            />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-secondary">Effective business date</p>
              <DatePicker
                value={businessDate}
                onChange={(value) => setBusinessDate(value ? parseDate(value.toString()) : null)}
                aria-label="Effective business date"
              />
              <p className="text-sm text-tertiary">Optional — defaults to today.</p>
            </div>
          </div>
          {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
          {mutation.isSuccess ? (
            <p className="text-sm text-success-primary">Rate stored for {mutation.data.effective_business_date}.</p>
          ) : null}
          <StickyFormActions variant="inset">
            <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
              Save rate
            </Button>
          </StickyFormActions>
        </SectionCard>
      </form>

      <TableCard.Root>
        <TableCard.Header title="Metal rates" badge={query.isLoading && items.length === 0 ? undefined : String(total)} />
        {query.isLoading && items.length === 0 ? (
          <TableSkeleton columns={4} rows={6} showCard={false} label="Loading metal rates" />
        ) : items.length === 0 ? (
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
                  <Table.Cell className="text-right font-medium">
                    <MoneyText amount={item.rate_per_gram} className="font-medium" />
                    /g
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        )}
        {!(query.isLoading && items.length === 0) ? (
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
        ) : null}
      </TableCard.Root>

      <MakingDefaultsSection onDirtyChange={setMakingDirty} onSavePendingChange={setMakingSavePending} />
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
    return `Fixed ${formatInr(making.amount_inr ?? "0")}`;
  }
  if (making.method === "per_gram") {
    return `${formatInr(making.rate_per_gram ?? "0")}/g`;
  }
  return `${making.percent ?? "0"}% of metal`;
}

function MakingDefaultsSection({
  onDirtyChange,
  onSavePendingChange,
}: {
  onDirtyChange: (dirty: boolean) => void;
  onSavePendingChange: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [purity, setPurity] = useState("");
  const [method, setMethod] = useState<"fixed" | "per_gram" | "percent_of_metal">("fixed");
  const [value, setValue] = useState("");

  const query = useQuery({
    queryKey: ["shop", "making-defaults"],
    queryFn: async () => fetchMakingChargeDefaults(await accessToken(), { page: 1, pageSize: 50 }),
  });

  const purities = useQuery({
    queryKey: ["shop", "purity-labels"],
    queryFn: async () => fetchPurityLabels(await accessToken()),
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
  const purityItems = (purities.data?.items ?? []).map((item) => ({ id: item.label, label: item.label }));
  const formDirty = purity.trim() !== "" || value.trim() !== "";

  useEffect(() => {
    onDirtyChange(formDirty);
  }, [formDirty, onDirtyChange]);

  useEffect(() => {
    onSavePendingChange(upsert.isPending);
  }, [onSavePendingChange, upsert.isPending]);

  return (
    <>
      <form
        className="w-full"
        onSubmit={(event) => {
          event.preventDefault();
          upsert.mutate();
        }}
      >
        <SectionCard
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
            <div className="flex flex-col gap-1.5">
              <CatalogueCombobox
                label="Purity"
                value={purity}
                placeholder="Select purity"
                isRequired
                isDisabled={purities.isLoading}
                items={purityItems}
                onChange={setPurity}
              />
              {!purities.isLoading && purityItems.length === 0 ? (
                <p className="text-sm text-tertiary">
                  No purities yet.{" "}
                  <button
                    type="button"
                    className="font-semibold text-brand-secondary hover:underline"
                    onClick={() => router.replace("/settings?tab=catalogues", { scroll: false })}
                  >
                    Add purities in Catalogues
                  </button>
                </p>
              ) : null}
            </div>
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
          <StickyFormActions variant="inset">
            <Button type="submit" color="primary" size="md" isLoading={upsert.isPending}>
              Save making default
            </Button>
          </StickyFormActions>
        </SectionCard>
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
                  <Table.Cell truncate={false}>
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

  const sequencesPanelDirty = query.data ? sequencesDirty(items, query.data.items) : false;
  useReportSettingsDirty("sequences", sequencesPanelDirty, mutation.isPending);

  if (query.isLoading && items.length === 0) {
    return <SequencesFormSkeleton label="Loading document sequences" />;
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
      <SectionCard
        title="Document numbering"
        description="Numbers advance when invoices, receipts, or tags are created."
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
        <StickyFormActions variant="inset">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save numbering
          </Button>
        </StickyFormActions>
      </SectionCard>
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

  const devicesDirty = form && query.data ? deviceFieldsDirty(form, query.data) : false;
  useReportSettingsDirty("devices", devicesDirty, mutation.isPending);

  if (!form) {
    return <FormSkeleton sections={2} fieldsPerSection={3} showStickyActions label="Loading device settings" />;
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
      <SectionCard title="Scanner" description="How barcode scans complete in inventory and POS.">
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
      </SectionCard>

      <SectionCard
        title="Print sizes"
        description="Invoice paper size drives invoice and receipt PDFs. Tag size is millimetres for article tags only. Print a sample to confirm the printer. If paper size or layout changed, create the PDF again from the sale or payment."
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
              { label: "80mm (thermal)", value: "80mm" },
            ]}
          />
        </div>
        <p className="text-sm text-tertiary">
          Short tags (under about 16 mm height) drop the logo and print the shop name instead so the barcode stays
          tall enough to scan. Changing invoice paper size applies to new PDFs and browser print immediately;
          regenerate outdated ready PDFs from the invoice or receipt document card.
        </p>
        {mutation.isError ? <p className="text-sm text-error-primary">{errorMessage(mutation.error)}</p> : null}
        {message ? <p className="text-sm text-success-primary">{message}</p> : null}
        <StickyFormActions variant="inset">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save device defaults
          </Button>
        </StickyFormActions>
      </SectionCard>
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

  const remindersDirty = form && query.data ? reminderFieldsDirty(form, query.data) : false;
  useReportSettingsDirty("reminders", remindersDirty, mutation.isPending);

  if (!form) {
    return <FormSkeleton sections={1} fieldsPerSection={3} showStickyActions label="Loading reminder preferences" />;
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
      <SectionCard
        title="Reminder preferences"
        description="Saved preferences. WhatsApp sending may not be live yet."
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
            label="Send window start (India time)"
            value={form.send_window_start}
            onChange={(value) => setForm({ ...form, send_window_start: value })}
          />
          <Input
            label="Send window end (India time)"
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
        <StickyFormActions variant="inset">
          <Button type="submit" color="primary" size="md" isLoading={mutation.isPending}>
            Save reminders
          </Button>
        </StickyFormActions>
      </SectionCard>
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
        badge={query.isLoading && !query.data ? undefined : String(total)}
        description="Staff changes and rate updates are recorded here."
      />
      {query.isLoading && !query.data ? (
        <TableSkeleton columns={3} rows={8} showCard={false} label="Loading audit events" />
      ) : (
        <>
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
                  <Table.Cell className="font-medium text-primary">
                    <span title={item.action}>{auditActionLabel(item.action)}</span>
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
        </>
      )}
    </TableCard.Root>
  );
}
