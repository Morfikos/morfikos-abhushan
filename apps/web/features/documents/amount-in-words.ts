/**
 * Convert a money decimal string (e.g. "6695.00") to English amount-in-words for INR.
 * Labels may be localized separately; words stay English for MVP.
 */
export function amountInrInWords(amount: string): string {
  const normalized = Number.parseFloat(amount);
  if (!Number.isFinite(normalized)) {
    return "";
  }
  const absolute = Math.abs(Math.round(normalized * 100) / 100);
  const rupees = Math.floor(absolute);
  const paise = Math.round((absolute - rupees) * 100);
  const rupeeWords = integerToWords(rupees);
  const prefix = normalized < 0 ? "Minus " : "";
  if (paise === 0) {
    return `${prefix}Rupees ${rupeeWords} Only`;
  }
  return `${prefix}Rupees ${rupeeWords} and ${integerToWords(paise)} Paise Only`;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) {
    return ONES[n] ?? "";
  }
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one === 0 ? (TENS[ten] ?? "") : `${TENS[ten] ?? ""} ${ONES[one] ?? ""}`.trim();
}

function integerToWords(n: number): string {
  if (n === 0) {
    return "Zero";
  }
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (crore > 0) {
    parts.push(`${integerToWords(crore)} Crore`);
  }
  if (lakh > 0) {
    parts.push(`${twoDigits(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${twoDigits(thousand)} Thousand`);
  }
  if (hundred > 0) {
    parts.push(`${ONES[hundred]} Hundred`);
  }
  if (rest > 0) {
    parts.push(twoDigits(rest));
  }
  return parts.join(" ").trim();
}
