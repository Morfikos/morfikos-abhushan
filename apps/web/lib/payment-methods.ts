import type { PaymentMethod } from "@aabhushan/contracts";

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "upi", "card", "bank"];

/** Method is always shown as text; colour alone never identifies a tender. */
export function paymentMethodLabel(method: PaymentMethod): string {
  if (method === "cash") {
    return "Cash";
  }
  if (method === "upi") {
    return "UPI";
  }
  if (method === "card") {
    return "Card";
  }
  return "Bank";
}

export function paymentMethodOptions(): { label: string; value: string }[] {
  return PAYMENT_METHODS.map((method) => ({ label: paymentMethodLabel(method), value: method }));
}

export function referenceHintFor(method: PaymentMethod): string {
  if (method === "cash") {
    return "Optional note for the cash handover.";
  }
  if (method === "upi") {
    return "UPI transaction reference, verified manually by staff.";
  }
  if (method === "card") {
    return "Card terminal approval or slip number.";
  }
  return "Bank transfer or cheque reference.";
}
