/**
 * Labels for invoice/receipt and related document print/PDF.
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
  | "bill_to"
  | "lines"
  | "article"
  | "description"
  | "amount"
  | "sl_no"
  | "barcode"
  | "purity"
  | "gross_weight"
  | "net_weight"
  | "rate_per_gram"
  | "metal_value"
  | "making_charge"
  | "line_discount"
  | "metal"
  | "making"
  | "wastage"
  | "stones"
  | "discount"
  | "tax"
  | "round_off"
  | "grand_total"
  | "paid"
  | "paid_in_full"
  | "due"
  | "collections"
  | "amount_in_words"
  | "weight_total"
  | "customer_signature"
  | "authorized_signatory"
  | "issued"
  | "method"
  | "invoices"
  | "reference"
  | "applied"
  | "received_by"
  | "account"
  | "released"
  | "recipient"
  | "packets_verified"
  | "reverses_receipt"
  | "thank_you";

export type PrintLabelLanguage = "en" | "hi" | "both";

const LABELS: Record<DocumentLabelKey, { en: string; hi: string }> = {
  tax_invoice: { en: "Tax Invoice", hi: "कर चालान" },
  receipt: { en: "Receipt", hi: "रसीद" },
  girvi_release_ack: { en: "Girvi release acknowledgement", hi: "गिरवी रिहाई पावती" },
  credit_note: { en: "Credit note", hi: "क्रेडिट नोट" },
  refund: { en: "Refund", hi: "धनवापसी" },
  invoice: { en: "Invoice", hi: "चालान" },
  business_date: { en: "Business date", hi: "व्यवसाय तिथि" },
  customer: { en: "Customer", hi: "ग्राहक" },
  bill_to: { en: "Bill to", hi: "बिल प्राप्तकर्ता" },
  lines: { en: "Lines", hi: "पंक्तियाँ" },
  article: { en: "Article", hi: "आर्टिकल" },
  description: { en: "Description", hi: "विवरण" },
  amount: { en: "Amount", hi: "राशि" },
  sl_no: { en: "Sl. No.", hi: "क्र." },
  barcode: { en: "Barcode", hi: "बारकोड" },
  purity: { en: "Purity", hi: "शुद्धता" },
  gross_weight: { en: "Gross g", hi: "कुल ग्राम" },
  net_weight: { en: "Net g", hi: "शुद्ध ग्राम" },
  rate_per_gram: { en: "Rate/g", hi: "दर/ग्राम" },
  metal_value: { en: "Metal ₹", hi: "धातु ₹" },
  making_charge: { en: "Making ₹", hi: "मजदूरी ₹" },
  line_discount: { en: "Discount ₹", hi: "छूट ₹" },
  metal: { en: "Metal", hi: "धातु" },
  making: { en: "Making", hi: "मजदूरी" },
  wastage: { en: "Wastage", hi: "वेस्टेज" },
  stones: { en: "Stones", hi: "पत्थर" },
  discount: { en: "Discount", hi: "छूट" },
  tax: { en: "Tax", hi: "कर" },
  round_off: { en: "Round off", hi: "राउंड ऑफ" },
  grand_total: { en: "Grand total", hi: "कुल योग" },
  paid: { en: "Paid", hi: "भुगतान" },
  // Hindi strings below need owner/linguist review before pilot printouts.
  paid_in_full: { en: "Paid in full", hi: "पूर्ण भुगतान" },
  due: { en: "Due", hi: "बकाया" },
  collections: { en: "Collections", hi: "वसूली" },
  amount_in_words: { en: "Amount in words", hi: "शब्दों में राशि" },
  weight_total: { en: "Weight total", hi: "कुल वजन" },
  customer_signature: { en: "Customer signature", hi: "ग्राहक हस्ताक्षर" },
  authorized_signatory: { en: "Authorized signatory", hi: "अधिकृत हस्ताक्षरकर्ता" },
  issued: { en: "Issued", hi: "जारी" },
  method: { en: "Method", hi: "विधि" },
  invoices: { en: "Invoices", hi: "चालान" },
  reference: { en: "Reference", hi: "संदर्भ" },
  applied: { en: "Applied to", hi: "आवंटित" },
  received_by: { en: "Received by", hi: "प्राप्तकर्ता स्टाफ" },
  account: { en: "Account", hi: "खाता" },
  released: { en: "Released", hi: "रिहा" },
  recipient: { en: "Recipient", hi: "प्राप्तकर्ता" },
  packets_verified: { en: "Packets verified", hi: "सत्यापित पैकेट" },
  reverses_receipt: { en: "Reverses receipt", hi: "पूर्व रसीद" },
  thank_you: { en: "Thank you", hi: "धन्यवाद" },
};

export function documentLabelPair(key: DocumentLabelKey): { en: string; hi: string } {
  return LABELS[key];
}

/** Label for HTML print language mode (en | hi | both). */
export function printLabel(key: DocumentLabelKey, lang: PrintLabelLanguage = "both"): string {
  const pair = LABELS[key];
  if (lang === "en") {
    return pair.en;
  }
  if (lang === "hi") {
    return pair.hi;
  }
  return `${pair.en} / ${pair.hi}`;
}

/** "English / हिन्दी" — used by PDF and bilingual callers. */
export function bilingualLabel(key: DocumentLabelKey): string {
  return printLabel(key, "both");
}
