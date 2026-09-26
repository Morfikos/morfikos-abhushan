import {
  formatInr,
  formatMoneyInputDisplay,
  groupIndianInteger,
} from "../src/money-format.ts";

/**
 * Database-free checks for Indian INR display grouping.
 * Usage: pnpm --filter @aabhushan/domain verify:money-format
 */

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(groupIndianInteger("0"), "0", "group 0");
assertEqual(groupIndianInteger("999"), "999", "group 999");
assertEqual(groupIndianInteger("1000"), "1,000", "group 1000");
assertEqual(groupIndianInteger("99999"), "99,999", "group 99999");
assertEqual(groupIndianInteger("100000"), "1,00,000", "group 100000");
assertEqual(groupIndianInteger("250000"), "2,50,000", "group 250000");
assertEqual(groupIndianInteger("10000000"), "1,00,00,000", "group 10000000");

assertEqual(formatInr("999"), "₹999.00", "format 999");
assertEqual(formatInr("1000"), "₹1,000.00", "format 1000");
assertEqual(formatInr("99999"), "₹99,999.00", "format 99999");
assertEqual(formatInr("100000"), "₹1,00,000.00", "format 100000");
assertEqual(formatInr("10000000"), "₹1,00,00,000.00", "format 10000000");
assertEqual(formatInr("10.5"), "₹10.50", "format 10.5");
assertEqual(formatInr("2000.000000"), "₹2,000.00", "format 6dp rate from db");
assertEqual(formatInr("2000.129"), "₹2,000.12", "format truncates beyond 2dp");
assertEqual(formatInr("-250000.00"), "-₹2,50,000.00", "format negative lakh");
assertEqual(formatInr("-0.00"), "₹0.00", "format -0.00");
assertEqual(formatInr(""), "—", "format empty");
assertEqual(formatInr("abc"), "—", "format non-numeric");

assertEqual(formatMoneyInputDisplay("100000.50"), "1,00,000.50", "input display paste");
assertEqual(formatMoneyInputDisplay("1500."), "1500.", "input display trailing dot");
assertEqual(formatMoneyInputDisplay("."), ".", "input display lone dot");
assertEqual(formatMoneyInputDisplay(""), "", "input display empty");

console.log("verify-money-format: ok");
