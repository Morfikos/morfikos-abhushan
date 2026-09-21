/**
 * Bilingual (EN + HI) labels for invoice/receipt and related document print/PDF.
 * Pure strings — safe for web and worker without Node-only deps.
 */

export type DocumentLabelKey =
  | "tax_invoice"
  | "receipt"
  | "girvi_release_ack"
  | "credit_note"
  | "refund"
  | "invoice"
  | "business_date"
  | "customer"
  | "lines"
  | "article"
  | "amount"
  | "metal"
  | "making"
  | "wastage"
  | "stones"
  | "discount"
  | "tax"
  | "round_off"
  | "grand_total"
  | "paid"
  | "due"
  | "issued"
  | "method"
  | "invoices"
  | "account"
  | "released"
  | "recipient"
  | "packets_verified"
  | "reverses_receipt";

const LABELS: Record<DocumentLabelKey, { en: string; hi: string }> = {
  tax_invoice: { en: "Tax Invoice", hi: "कर चालान" },
  receipt: { en: "Receipt", hi: "रसीद" },
  girvi_release_ack: { en: "Girvi release acknowledgement", hi: "गिरवी रिहाई पावती" },
  credit_note: { en: "Credit note", hi: "क्रेडिट नोट" },
  refund: { en: "Refund", hi: "धनवापसी" },
  invoice: { en: "Invoice", hi: "चालान" },
  business_date: { en: "Business date", hi: "व्यवसाय तिथि" },
  customer: { en: "Customer", hi: "ग्राहक" },
  lines: { en: "Lines", hi: "पंक्तियाँ" },
  article: { en: "Article", hi: "आर्टिकल" },
  amount: { en: "Amount", hi: "राशि" },
  metal: { en: "Metal", hi: "धातु" },
  making: { en: "Making", hi: "मजदूरी" },
  wastage: { en: "Wastage", hi: "वेस्टेज" },
  stones: { en: "Stones", hi: "पत्थर" },
  discount: { en: "Discount", hi: "छूट" },
  tax: { en: "Tax", hi: "कर" },
  round_off: { en: "Round off", hi: "राउंड ऑफ" },
  grand_total: { en: "Grand total", hi: "कुल योग" },
  paid: { en: "Paid", hi: "भुगतान" },
  due: { en: "Due", hi: "बकाया" },
  issued: { en: "Issued", hi: "जारी" },
  method: { en: "Method", hi: "विधि" },
  invoices: { en: "Invoices", hi: "चालान" },
  account: { en: "Account", hi: "खाता" },
  released: { en: "Released", hi: "रिहा" },
  recipient: { en: "Recipient", hi: "प्राप्तकर्ता" },
  packets_verified: { en: "Packets verified", hi: "सत्यापित पैकेट" },
  reverses_receipt: { en: "Reverses receipt", hi: "पूर्व रसीद" },
};

/** "English / हिन्दी" for print headings and row labels. */
export function bilingualLabel(key: DocumentLabelKey): string {
  const pair = LABELS[key];
  return `${pair.en} / ${pair.hi}`;
}

export function documentLabelPair(key: DocumentLabelKey): { en: string; hi: string } {
  return LABELS[key];
}
