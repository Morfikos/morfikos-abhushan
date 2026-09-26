"use client";

import { useMemo, type ReactNode, type Ref } from "react";
import { netMetalWeightGrams, netMetalWeightIsPositive } from "@aabhushan/domain";
import { Check, Image01 } from "@untitledui/icons";

import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { metalBadgeColor } from "@/features/inventory/inventory-shared";
import { cx } from "@/utils/cx";

export const WEIGHT_PATTERN = /^\d+(\.\d{1,4})?$/;

export const FORM_CARD_CLASS = "rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary md:p-7";

/** Neutral disabled fill at full opacity for sticky-rail primaries only. */
export const RAIL_PRIMARY_DISABLED_CLASS =
  "disabled:opacity-100 disabled:bg-secondary disabled:text-tertiary disabled:ring-1 disabled:ring-secondary disabled:before:hidden";

export type WeightMath = {
  net: string | null;
  signed: string | null;
  invalid: boolean;
};

export function computeWeightMath(gross: string, nonMetal: string): WeightMath {
  const grossValue = gross.trim();
  const nonMetalValue = (nonMetal.trim() || "0").trim();
  if (!WEIGHT_PATTERN.test(grossValue) || !WEIGHT_PATTERN.test(nonMetalValue)) {
    return { net: null, signed: null, invalid: false };
  }
  try {
    const signed = netMetalWeightGrams(grossValue, nonMetalValue);
    const positive = netMetalWeightIsPositive({
      grossWeightGrams: grossValue,
      nonMetalWeightGrams: nonMetalValue,
    });
    return {
      net: positive ? signed : null,
      signed,
      invalid: !positive,
    };
  } catch {
    return { net: null, signed: null, invalid: false };
  }
}

export function useWeightMath(gross: string, nonMetal: string): WeightMath {
  return useMemo(() => computeWeightMath(gross, nonMetal), [gross, nonMetal]);
}

export function NumberedSection({
  number,
  title,
  optional,
  children,
}: {
  number: string;
  title: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-secondary pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="mb-5 flex items-baseline gap-2.5">
        <span className="text-sm font-bold text-brand-secondary">{number}</span>
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        {optional ? <span className="text-sm text-tertiary">optional</span> : null}
      </div>
      {children}
    </section>
  );
}

const WEIGHTS_BROKEN_MESSAGE = "Non-metal can't be more than gross. Net must be above zero.";

export function WeightEquationRow({
  gross,
  nonMetal,
  weightMath,
  weightsBroken,
  grossFieldError,
  nonMetalFieldError,
  isDisabled,
  grossRef,
  onGrossChange,
  onNonMetalChange,
}: {
  gross: string;
  nonMetal: string;
  weightMath: WeightMath;
  weightsBroken: boolean;
  grossFieldError?: string;
  nonMetalFieldError?: string;
  isDisabled?: boolean;
  grossRef?: Ref<HTMLInputElement>;
  onGrossChange: (value: string) => void;
  onNonMetalChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.1fr)_auto_minmax(0,0.85fr)] items-start gap-x-4">
        <Input
          label="Gross"
          value={gross}
          isRequired
          isDisabled={isDisabled}
          isInvalid={Boolean(grossFieldError) || weightsBroken}
          error={grossFieldError}
          hint="Up to 4 decimal places"
          inputMode="decimal"
          suffix="g"
          ref={grossRef}
          onChange={onGrossChange}
        />
        <span
          className="self-start pt-[1.625rem] text-xl font-semibold text-tertiary"
          aria-hidden="true"
        >
          −
        </span>
        <Input
          label="Non-metal"
          value={nonMetal}
          isDisabled={isDisabled}
          isInvalid={Boolean(nonMetalFieldError) || weightsBroken}
          error={nonMetalFieldError}
          inputMode="decimal"
          suffix="g"
          onChange={onNonMetalChange}
        />
        <span
          className="self-start pt-[1.625rem] text-xl font-semibold text-tertiary"
          aria-hidden="true"
        >
          =
        </span>
        <div className="flex flex-col gap-1 px-1 pt-[1.625rem]">
          <span
            className={cx("text-sm", weightsBroken ? "text-error-primary" : "text-tertiary")}
          >
            Net metal
          </span>
          <span
            className={cx(
              "text-2xl font-semibold tabular-nums",
              weightsBroken
                ? "rounded-lg bg-error-primary/10 px-2 py-1 text-error-primary"
                : "text-primary",
            )}
          >
            {weightMath.signed !== null ? `${weightMath.signed} g` : "— g"}
          </span>
        </div>
      </div>
      {weightsBroken ? <p className="text-sm text-error-primary">{WEIGHTS_BROKEN_MESSAGE}</p> : null}
    </div>
  );
}

export function ArticlePreviewCard({
  articleNumber,
  numberPending = false,
  categoryName,
  metal,
  purity,
  netMetalSigned,
  weightsBroken,
  photoUrl,
  emptyPhotoAction,
  emptyPhotoLabel = "No photograph",
  gross,
  nonMetal,
  detailLine,
}: {
  articleNumber: string;
  numberPending?: boolean;
  categoryName: string | null;
  metal: "gold" | "silver";
  purity: string;
  netMetalSigned: string | null;
  weightsBroken: boolean;
  photoUrl: string | null;
  emptyPhotoAction?: { label: string; onPress: () => void };
  emptyPhotoLabel?: string;
  gross?: string;
  nonMetal?: string;
  detailLine?: string | null;
}) {
  const grossTrimmed = (gross ?? "").trim();
  const nonMetalTrimmed = (nonMetal ?? "").trim();
  const showEquation =
    Boolean(grossTrimmed) &&
    WEIGHT_PATTERN.test(nonMetalTrimmed) &&
    Number(nonMetalTrimmed) > 0;

  return (
    <div className="rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary">
      <h3 className="mb-4 text-base font-semibold text-primary">Preview</h3>
      {photoUrl ? (
        <div className="mb-4 aspect-[4/3] overflow-hidden rounded-lg bg-secondary">
          <img src={photoUrl} alt="" className="size-full object-cover" />
        </div>
      ) : emptyPhotoAction ? (
        <Button
          color="secondary"
          size="md"
          className="mb-4 w-full justify-start gap-2 rounded-lg bg-secondary px-3.5 py-3 ring-1 ring-secondary"
          iconLeading={Image01}
          onPress={emptyPhotoAction.onPress}
        >
          {emptyPhotoAction.label}
        </Button>
      ) : (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg bg-secondary px-3.5 py-3">
          <Image01 className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
          <p className="text-base text-tertiary">{emptyPhotoLabel}</p>
        </div>
      )}
      {numberPending ? (
        <p className="text-base text-tertiary">Assigned when received</p>
      ) : (
        <p className="font-mono text-lg font-semibold text-primary">{articleNumber}</p>
      )}
      {categoryName ? <p className="mt-1 text-lg font-semibold text-primary">{categoryName}</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Badge color={metalBadgeColor(metal)} size="md">
          {metal === "gold" ? "Gold" : "Silver"}
        </Badge>
        {purity.trim() ? (
          <Badge color="gray" size="md">
            {purity.trim()}
          </Badge>
        ) : null}
      </div>
      {detailLine ? (
        <p className="mt-2.5 truncate text-base text-tertiary" title={detailLine}>
          {detailLine}
        </p>
      ) : null}
      <div className="mt-5 border-t border-secondary pt-4">
        <p className="text-base font-medium text-tertiary">Net metal</p>
        <p
          className={cx(
            "mt-1 text-2xl font-bold tabular-nums",
            weightsBroken ? "text-error-primary" : "text-primary",
          )}
        >
          {netMetalSigned !== null ? `${netMetalSigned} g` : "— g"}
        </p>
        {showEquation ? (
          <p className="mt-1 text-base tabular-nums text-tertiary">
            {grossTrimmed} − {nonMetalTrimmed}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type ArticleChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  /** Show error styling before submit (e.g. broken weight equation). */
  liveError?: boolean;
  jumpLabel: string;
  jump: () => void;
};

export function ArticleChecklistCard({
  title,
  items,
  readyLabel,
  submitted,
  formLevelError,
  children,
}: {
  title: string;
  items: ArticleChecklistItem[];
  readyLabel: string;
  submitted: boolean;
  formLevelError?: string | null;
  children: ReactNode;
}) {
  const allReady = items.every((item) => item.ok);

  return (
    <div className="rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary">
      <p className="mb-4 text-lg font-semibold text-primary">{title}</p>
      {allReady ? (
        <p className="flex items-center gap-3 text-lg text-secondary">
          <span className="flex size-6 items-center justify-center rounded-full bg-success-solid text-white">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
          <span className="font-medium">{readyLabel}</span>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const showError = !item.ok && (submitted || Boolean(item.liveError));
            return (
              <li
                key={item.id}
                className={cx(
                  "flex items-center gap-3 text-lg",
                  showError ? "text-error-primary" : "text-secondary",
                )}
              >
                <span
                  className={cx(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    item.ok ? "bg-success-solid text-white" : "bg-secondary ring-1 ring-secondary",
                  )}
                >
                  {item.ok ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </span>
                <span className="flex-1 font-medium">{item.label}</span>
                {showError ? (
                  <Button color="link-gray" size="md" className="!text-error-primary" onPress={item.jump}>
                    {item.jumpLabel}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {formLevelError ? <p className="mt-4 text-base text-error-primary">{formLevelError}</p> : null}

      <div className="mt-6 flex flex-col items-center gap-3">{children}</div>
    </div>
  );
}
