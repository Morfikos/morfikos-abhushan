import { cx } from "@/utils/cx";

export function AabhushanLogo({ className }: { className?: string }) {
  return (
    <span className={cx("text-lg font-semibold tracking-tight text-primary", className)}>Aabhushan</span>
  );
}
