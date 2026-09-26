import { formatInr, isZeroMoney } from "@/lib/money";
import { cx } from "@/utils/cx";

export type MoneyTextSign = "auto" | "debit" | "absolute";

function amountForSign(amount: string, sign: MoneyTextSign): string {
  const trimmed = amount.trim();
  if (sign === "absolute") {
    return trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  }
  if (sign === "debit") {
    if (!trimmed || trimmed.startsWith("-")) {
      return trimmed;
    }
    return `-${trimmed}`;
  }
  return trimmed;
}

/** Staff-facing money: Inter body font + tabular numerals via formatInr. */
export function MoneyText({
  amount,
  className,
  as: Comp = "span",
  sign = "auto",
  zero = "amount",
}: {
  amount: string;
  className?: string;
  as?: "span" | "p" | "dd" | "div";
  /** auto = format as stored; debit = force leading minus + error colour; absolute = drop leading minus. */
  sign?: MoneyTextSign;
  /** dash = em dash when amount is zero (nothing owed). amount = show ₹0.00. */
  zero?: "amount" | "dash";
}) {
  if (zero === "dash" && isZeroMoney(amount)) {
    return <Comp className={cx("text-quaternary", className)}>—</Comp>;
  }

  return (
    <Comp
      className={cx(
        "tabular-nums",
        sign === "debit" && "text-error-primary",
        className,
      )}
    >
      {formatInr(amountForSign(amount, sign))}
    </Comp>
  );
}
