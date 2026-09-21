import { formatInr } from "@/lib/money";
import { cx } from "@/utils/cx";

/** Staff-facing money: Inter body font + tabular numerals via formatInr. */
export function MoneyText({
  amount,
  className,
  as: Comp = "span",
}: {
  amount: string;
  className?: string;
  as?: "span" | "p" | "dd" | "div";
}) {
  return <Comp className={cx("tabular-nums", className)}>{formatInr(amount)}</Comp>;
}
