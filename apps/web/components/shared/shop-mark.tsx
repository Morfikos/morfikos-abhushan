import { cx } from "@/utils/cx";

type ShopMarkProps = {
  legalName: string;
  logoUrl?: string | null;
  className?: string;
  /** Compact for mobile header / tight spaces; lg for auth brand panel */
  size?: "sm" | "md" | "lg";
  /** When false, soft-hides the name (keeps layout for width transitions). */
  showName?: boolean;
  /** White / on-brand colors for brand-solid surfaces (auth shell). */
  variant?: "default" | "onBrand";
};

export function ShopMark({
  legalName,
  logoUrl,
  className,
  size = "md",
  showName = true,
  variant = "default",
}: ShopMarkProps) {
  const markSize = size === "sm" ? "size-7" : size === "lg" ? "size-14" : "size-8";
  const nameClass = size === "lg" ? "text-display-xs max-w-72" : "text-lg max-w-48";
  const initialSize = size === "lg" ? "text-xl" : "text-sm";
  const initial = legalName.trim().charAt(0).toUpperCase() || "A";
  const onBrand = variant === "onBrand";

  return (
    <span className={cx("flex min-w-0 items-center gap-2.5", className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={cx(
            markSize,
            "shrink-0 rounded-md object-contain ring-1",
            onBrand ? "bg-white/10 ring-white/30" : "ring-secondary",
          )}
        />
      ) : (
        <span
          aria-hidden
          className={cx(
            markSize,
            initialSize,
            "flex shrink-0 items-center justify-center rounded-md font-semibold ring-1",
            onBrand
              ? "bg-white/15 text-primary_on-brand ring-white/30"
              : "bg-brand-primary text-brand-secondary ring-brand-secondary",
          )}
        >
          {initial}
        </span>
      )}
      <span
        className={cx(
          "min-w-0 overflow-hidden font-semibold tracking-tight transition-[opacity,max-width] duration-300 ease-in-out motion-reduce:transition-none",
          onBrand ? "text-primary_on-brand" : "text-primary",
          showName ? cx(nameClass, "opacity-100") : "max-w-0 opacity-0",
        )}
        aria-hidden={!showName}
      >
        <span className="block truncate">{legalName}</span>
      </span>
    </span>
  );
}
