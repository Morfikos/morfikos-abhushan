"use client";

import { useState } from "react";

import { SelectField } from "@/components/shared/select-field";

/** Temporary public preview for SelectField verification. */
export default function SelectPreviewPage() {
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="text-display-xs font-semibold text-primary">Select preview</h1>
      <p className="text-md text-tertiary">Temporary page to verify themed selects.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { label: "All statuses", value: "" },
            { label: "Available", value: "available" },
            { label: "Sold", value: "sold" },
            { label: "Under review", value: "return_inspection" },
            { label: "Unavailable", value: "unavailable" },
          ]}
        />
        <SelectField
          label="Category"
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { label: "All categories", value: "" },
            { label: "Necklace", value: "necklace" },
            { label: "Ring", value: "ring" },
          ]}
        />
      </div>
    </main>
  );
}
