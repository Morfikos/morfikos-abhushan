"use client";

import { useEffect, useState } from "react";
import type { InvoiceLine, InvoiceLinePricing } from "@aabhushan/contracts";
import { DEFAULT_INVOICE_LINE_PRICING } from "@aabhushan/contracts";
import { Heading } from "react-aria-components";

import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { SelectField } from "@/components/shared/select-field";
import {
  defaultMakingValue,
  makingValueFieldMeta,
  validateMakingValue,
} from "@/features/invoices/invoice-shared";

type MakingMethod = InvoiceLinePricing["making_charge"]["method"];
type WastageMode = "none" | "percent_of_net_weight";
type DiscountMode = "none" | "amount" | "percent";

export type PosLinePricingDialogProps = {
  line: InvoiceLine | null;
  isOpen: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (pricing: InvoiceLinePricing) => void;
};

function makingValue(pricing: InvoiceLinePricing): string {
  const making = pricing.making_charge;
  if (making.method === "fixed") {
    return making.amount_inr;
  }
  if (making.method === "per_gram") {
    return making.rate_per_gram;
  }
  return making.percent;
}

export function PosLinePricingDialog({ line, isOpen, isSaving, onClose, onSave }: PosLinePricingDialogProps) {
  const [makingMethod, setMakingMethod] = useState<MakingMethod>("fixed");
  const [makingAmount, setMakingAmount] = useState("0.00");
  const [wastageMode, setWastageMode] = useState<WastageMode>("none");
  const [wastagePercent, setWastagePercent] = useState("0");
  const [stoneDescription, setStoneDescription] = useState("");
  const [stoneAmount, setStoneAmount] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [discountValue, setDiscountValue] = useState("");

  useEffect(() => {
    if (!line) {
      return;
    }
    const pricing = line.pricing ?? DEFAULT_INVOICE_LINE_PRICING;
    setMakingMethod(pricing.making_charge.method);
    setMakingAmount(makingValue(pricing));
    if (pricing.wastage?.method === "percent_of_net_weight") {
      setWastageMode("percent_of_net_weight");
      setWastagePercent(pricing.wastage.percent);
    } else {
      setWastageMode("none");
      setWastagePercent("0");
    }
    const stone = pricing.stone_charges?.[0];
    setStoneDescription(stone?.description ?? "");
    setStoneAmount(stone?.amount_inr ?? "");
    if (pricing.line_discount?.method === "amount") {
      setDiscountMode("amount");
      setDiscountValue(pricing.line_discount.amount_inr);
    } else if (pricing.line_discount?.method === "percent") {
      setDiscountMode("percent");
      setDiscountValue(pricing.line_discount.percent);
    } else {
      setDiscountMode("none");
      setDiscountValue("");
    }
  }, [line]);

  const makingMeta = makingValueFieldMeta(makingMethod);
  const makingCheck = validateMakingValue(makingMethod, makingAmount);
  const makingValid = makingCheck.valid;

  function buildPricing(): InvoiceLinePricing {
    let making_charge: InvoiceLinePricing["making_charge"];
    if (makingMethod === "fixed") {
      making_charge = { method: "fixed", amount_inr: makingAmount.trim() || "0.00" };
    } else if (makingMethod === "per_gram") {
      making_charge = { method: "per_gram", rate_per_gram: makingAmount.trim() || "0" };
    } else {
      making_charge = { method: "percent_of_metal", percent: makingAmount.trim() || "0" };
    }

    const wastage =
      wastageMode === "none"
        ? ({ method: "none" } as const)
        : ({ method: "percent_of_net_weight", percent: wastagePercent.trim() || "0" } as const);

    const stone_charges =
      stoneAmount.trim() !== ""
        ? [
            {
              description: stoneDescription.trim() || "Stone",
              amount_inr: stoneAmount.trim(),
            },
          ]
        : [];

    let line_discount: InvoiceLinePricing["line_discount"] = null;
    if (discountMode === "amount" && discountValue.trim() !== "") {
      line_discount = { method: "amount", amount_inr: discountValue.trim() };
    } else if (discountMode === "percent" && discountValue.trim() !== "") {
      line_discount = { method: "percent", percent: discountValue.trim() };
    }

    return { making_charge, wastage, stone_charges, line_discount };
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      isDismissable={!isSaving}
      onOpenChange={(open) => {
        if (!open && !isSaving) {
          onClose();
        }
      }}
    >
      <Modal className="max-w-lg">
        <Dialog className="flex flex-col gap-4 p-5 outline-hidden">
          <Heading slot="title" className="text-lg font-semibold text-primary">
            Line pricing
          </Heading>
          <p className="text-sm text-tertiary">
            {line ? `${line.description} · ${line.article_number}` : "Select a line"}
          </p>

          <SelectField
            label="Making method"
            value={makingMethod}
            onChange={(value) => {
              const method = value as MakingMethod;
              setMakingMethod(method);
              setMakingAmount(defaultMakingValue(method));
            }}
            options={[
              { label: "Fixed ₹", value: "fixed" },
              { label: "₹ per gram net metal", value: "per_gram" },
              { label: "% of metal value", value: "percent_of_metal" },
            ]}
          />
          <Input
            label={makingMeta.label}
            placeholder={makingMeta.placeholder}
            value={makingAmount}
            isInvalid={!makingValid}
            hint={makingCheck.hint ?? undefined}
            onChange={setMakingAmount}
          />

          <SelectField
            label="Wastage"
            value={wastageMode}
            onChange={(value) => setWastageMode(value as WastageMode)}
            options={[
              { label: "None", value: "none" },
              { label: "% of net metal weight", value: "percent_of_net_weight" },
            ]}
          />
          {wastageMode === "percent_of_net_weight" ? (
            <Input label="Wastage percent" value={wastagePercent} onChange={setWastagePercent} />
          ) : null}

          <Input label="Stone description (optional)" value={stoneDescription} onChange={setStoneDescription} />
          <Input label="Stone charge (INR, optional)" value={stoneAmount} onChange={setStoneAmount} />

          <SelectField
            label="Line discount"
            value={discountMode}
            onChange={(value) => setDiscountMode(value as DiscountMode)}
            options={[
              { label: "None", value: "none" },
              { label: "Fixed ₹", value: "amount" },
              { label: "Percent", value: "percent" },
            ]}
          />
          {discountMode !== "none" ? (
            <Input
              label={discountMode === "amount" ? "Discount amount (INR)" : "Discount percent"}
              value={discountValue}
              onChange={setDiscountValue}
            />
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button color="secondary" size="md" isDisabled={isSaving} onPress={onClose}>
              Cancel
            </Button>
            <Button
              color="primary"
              size="md"
              isDisabled={!line || isSaving || !makingValid}
              isLoading={isSaving}
              onPress={() => onSave(buildPricing())}
            >
              Update quote
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
