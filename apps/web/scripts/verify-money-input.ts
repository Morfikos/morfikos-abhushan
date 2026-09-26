/**
 * Database-free checks for web money input normalize (trailing-dot blur).
 * Usage: pnpm --filter @aabhushan/web verify:money-input
 */

import { normalizeMoneyInput } from "../lib/money.ts";

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(normalizeMoneyInput("1500."), "1500.00", "trailing dot");
assertEqual(normalizeMoneyInput("10"), "10.00", "whole");
assertEqual(normalizeMoneyInput("10.5"), "10.50", "one decimal");
assertEqual(normalizeMoneyInput("10.50"), "10.50", "already normalized");
assertEqual(normalizeMoneyInput("."), ".", "lone dot stays");
assertEqual(normalizeMoneyInput(""), "", "empty stays");
assertEqual(normalizeMoneyInput("abc"), "abc", "non-money stays");

console.log("verify-money-input: ok");
