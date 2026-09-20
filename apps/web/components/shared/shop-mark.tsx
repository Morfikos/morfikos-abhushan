import { cx } from "@/utils/cx";

type ShopMarkProps = {
  legalName: string;
  logoUrl?: string | null;
  className?: string;
  /** Compact for mobile header / tight spaces */
  size?: "sm" | "md";
};

export function ShopMark({ legalName, logoUrl, className, size = "md" }: ShopMarkProps) {
  const markSize = size === "sm" ? "size-7" : "size-8";
  const initial = legalName.trim().charAt(0).toUpperCase() || "A";

  return (
    <span className={cx("flex min-w-0 items-center gap-2.5", className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={cx(markSize, "shrink-0 rounded-md object-contain ring-1 ring-secondary")}
        />
      ) : (
        <span
          aria-hidden
          className={cx(
            markSize,
            "flex shrink-0 items-center justify-center rounded-md bg-brand-primary text-sm font-semibold text-brand-secondary ring-1 ring-brand-secondary",
          )}
        >
          {initial}
        </span>
      )}
      <span className="truncate text-lg font-semibold tracking-tight text-primary">{legalName}</span>
    </span>
  );
}
