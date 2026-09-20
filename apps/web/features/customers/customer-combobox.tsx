"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heading } from "react-aria-components";
import type { Customer, CustomerListItem } from "@aabhushan/contracts";
import { Plus } from "@untitledui/icons";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { ComboBox } from "@/components/base/select/combobox";
import { SelectItem } from "@/components/base/select/select-item";
import { staffHasPermission, useStaff } from "@/features/auth/staff-shell";
import { CustomerForm, customerCreatePayload, emptyCustomerForm } from "@/features/customers/customer-form";
import { customerAccessToken } from "@/features/customers/customer-shared";
import { createCustomerRequest, fetchCustomers, fetchReminders } from "@/lib/staff-api";

const CREATE_KEY = "create-customer";

type ComboItem = {
  id: string;
  label: string;
  supportingText?: string;
  avatarUrl?: undefined;
};

export function CustomerCombobox({
  label = "Customer",
  selected,
  onSelect,
  isDisabled = false,
}: {
  label?: string;
  selected: CustomerListItem | Customer | null;
  onSelect: (customer: CustomerListItem | Customer) => void;
  isDisabled?: boolean;
}) {
  const staff = useStaff();
  const queryClient = useQueryClient();
  const canWrite = staffHasPermission(staff, "customers.write");
  const [inputValue, setInputValue] = useState(selected?.display_name ?? "");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);

  const search = useQuery({
    queryKey: ["customers", "search", staff.membership.organization_id, inputValue],
    queryFn: async () =>
      fetchCustomers(await customerAccessToken(), {
        page: 1,
        pageSize: 10,
        sort: "name",
        direction: "asc",
        ...(inputValue.trim() ? { q: inputValue.trim() } : {}),
      }),
    enabled: !isDisabled,
  });

  const reminders = useQuery({
    queryKey: ["shop", "reminders", staff.membership.organization_id],
    queryFn: async () => fetchReminders(await customerAccessToken()),
    enabled: creating,
  });

  const items = useMemo<ComboItem[]>(() => {
    const rows: ComboItem[] = (search.data?.items ?? []).map((item) => ({
      id: item.id,
      label: item.display_name,
      supportingText: item.phone_display ?? "No phone",
    }));
    if (canWrite) {
      rows.unshift({ id: CREATE_KEY, label: "Create customer", supportingText: "Add a customer for billing or Girvi" });
    }
    return rows;
  }, [canWrite, search.data]);

  const customersById = useMemo(() => {
    const map = new Map<string, CustomerListItem>();
    for (const item of search.data?.items ?? []) {
      map.set(item.id, item);
    }
    if (selected) {
      map.set(selected.id, selected);
    }
    return map;
  }, [search.data, selected]);

  return (
    <>
      <ComboBox
        label={label}
        placeholder="Search by name or phone"
        shortcut={false}
        selectedKey={selected?.id ?? null}
        inputValue={inputValue}
        onInputChange={setInputValue}
        isDisabled={isDisabled}
        items={items}
        menuTrigger="focus"
        onSelectionChange={(key) => {
          const id = key == null ? "" : String(key);
          if (!id) {
            return;
          }
          if (id === CREATE_KEY) {
            setCreating(true);
            setCreateError(null);
            return;
          }
          const customer = customersById.get(id);
          if (customer) {
            onSelect(customer);
            setInputValue(customer.display_name);
          }
        }}
      >
        {(item) => (
          <SelectItem
            id={item.id}
            label={item.label}
            supportingText={item.supportingText}
            icon={item.id === CREATE_KEY ? Plus : undefined}
          />
        )}
      </ComboBox>

      <ModalOverlay
        isOpen={creating}
        isDismissable={!creatingBusy}
        onOpenChange={(open) => {
          if (!open && !creatingBusy) {
            setCreating(false);
          }
        }}
        className={(state) =>
          [
            "fixed inset-0 z-50 flex min-h-dvh w-full items-end justify-center overflow-y-auto bg-overlay/70 px-4 py-8 outline-hidden backdrop-blur-[6px] sm:items-center sm:p-8",
            state.isEntering ? "duration-300 ease-out animate-in fade-in" : "",
            state.isExiting ? "duration-200 ease-in animate-out fade-out" : "",
          ].join(" ")
        }
      >
        <Modal className="w-full max-w-lg">
          <Dialog className="relative w-full max-h-[min(90dvh,44rem)] overflow-y-auto rounded-2xl bg-primary p-6 shadow-xl outline-hidden">
            <Heading slot="title" className="text-lg font-semibold text-primary">
              Create customer
            </Heading>
            <p className="mt-1 mb-4 text-sm text-tertiary">
              Saving a customer does not create a sale. The parent draft stays unsent.
            </p>
            {reminders.isLoading ? (
              <p className="text-sm text-tertiary">Loading form…</p>
            ) : (
              <CustomerForm
                initial={emptyCustomerForm(reminders.data?.language ?? "en")}
                submitLabel="Save and select"
                isSubmitting={creatingBusy}
                error={createError}
                onCancel={() => setCreating(false)}
                onSubmit={(values) => {
                  setCreatingBusy(true);
                  setCreateError(null);
                  void (async () => {
                    try {
                      const customer = await createCustomerRequest(
                        await customerAccessToken(),
                        customerCreatePayload(values),
                      );
                      void queryClient.invalidateQueries({ queryKey: ["customers"] });
                      onSelect(customer);
                      setInputValue(customer.display_name);
                      setCreating(false);
                    } catch (error) {
                      setCreateError(error);
                    } finally {
                      setCreatingBusy(false);
                    }
                  })();
                }}
              />
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
