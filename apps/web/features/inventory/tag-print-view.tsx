"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TAG_FOOTER_HEIGHT_MM,
  TAG_INSET_MM,
  TAG_NAME_RAIL_WIDTH_MM,
  TAG_RAIL_GAP_MM,
  TAG_TEMPLATE_VERSION,
} from "@aabhushan/domain";
import type { TagPreview, TagPrintKind } from "@aabhushan/contracts";

import { TagPrintSkeleton } from "@/components/application/skeleton/skeleton";
import { Button } from "@/components/base/buttons/button";
import { PrintPreviewChrome, PrintPreviewPill } from "@/features/documents/print-preview-chrome";
import {
  formatGrams,
  inventoryAccessToken,
  inventoryErrorMessage,
} from "@/features/inventory/inventory-shared";
import {
  assignArticleBarcodesBatchRequest,
  fetchTagPreview,
  recordTagPrintRequest,
  StaffApiError,
} from "@/lib/staff-api";

function parseKind(value: string | null): TagPrintKind {
  if (value === "reprint" || value === "batch") {
    return value;
  }
  return "initial";
}

function metalDisplay(metal: string): string {
  return metal.charAt(0).toUpperCase() + metal.slice(1);
}

/** Two-decimal grams for the stamp (avoids raw DB scale like 10.0000). */
function stampGrams(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {
    return formatGrams(value);
  }
  return formatGrams(n.toFixed(2));
}

function TagStamp({ tag }: { tag: TagPreview }) {
  const barcodeMaxHeight = `${tag.barcode_height_mm}mm`;
  const purityLine = `${metalDisplay(tag.metal)} ${tag.purity}`;
  const weightsLine = `Gross ${stampGrams(tag.gross_weight_grams)} · Net ${stampGrams(tag.net_metal_weight_grams)}`;

  return (
    <article
      className="tag-print-card flex overflow-visible border border-black bg-white text-black shadow-xs"
      style={{
        width: `${tag.tag_width_mm}mm`,
        height: `${tag.tag_height_mm}mm`,
        padding: `${TAG_INSET_MM}mm`,
        gap: `${TAG_RAIL_GAP_MM}mm`,
      }}
    >
      <div
        className="tag-print-name-rail flex shrink-0 items-center justify-center overflow-hidden border-r border-black"
        style={{ width: `${TAG_NAME_RAIL_WIDTH_MM}mm` }}
      >
        <p
          className="max-h-full truncate text-[7.5px] font-bold leading-none tracking-[0.12em] text-black"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {tag.legal_name}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-visible">
        <div
          className="tag-print-barcode flex min-h-0 flex-1 items-center justify-center overflow-visible"
          style={{ ["--tag-barcode-max" as string]: barcodeMaxHeight }}
          dangerouslySetInnerHTML={{ __html: tag.barcode_svg }}
        />
        <div
          className="flex shrink-0 flex-col items-center justify-center gap-px overflow-hidden border-t border-black pt-px"
          style={{ height: `${TAG_FOOTER_HEIGHT_MM}mm` }}
        >
          <p className="font-mono text-[7.5px] font-semibold leading-none tracking-tight text-black">
            {tag.barcode}
          </p>
          <p className="truncate text-[6px] font-medium leading-none tracking-wide text-neutral-800">
            {purityLine}
          </p>
          <p className="truncate text-[5.5px] tabular-nums leading-none text-neutral-700">{weightsLine}</p>
        </div>
      </div>
    </article>
  );
}

export function TagPrintView() {
  const searchParams = useSearchParams();
  const ids = useMemo(
    () =>
      (searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    [searchParams],
  );
  const kind = parseKind(searchParams.get("kind"));
  const reason = searchParams.get("reason")?.trim() || undefined;

  const [previews, setPreviews] = useState<TagPreview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [recording, setRecording] = useState(false);
  const [awaitingPhysical, setAwaitingPhysical] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (ids.length === 0) {
          throw new StaffApiError(400, "INVALID_INPUT", "Select at least one article to print.");
        }
        if (kind === "reprint" && !reason) {
          throw new StaffApiError(422, "VALIDATION_ERROR", "A reason is required to reprint a tag.");
        }
        const token = await inventoryAccessToken();
        await assignArticleBarcodesBatchRequest(token, ids);
        const loaded: TagPreview[] = [];
        for (const id of ids) {
          loaded.push(await fetchTagPreview(token, id));
        }
        if (!cancelled) {
          setPreviews(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(inventoryErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ids, kind, reason]);

  const first = previews[0];
  const widthMm = first?.tag_width_mm ?? "50";
  const heightMm = first?.tag_height_mm ?? "25";
  const barcodeMaxMm = first?.barcode_height_mm ?? "10";
  const tagCount = previews.length;
  const isReprint = kind === "reprint";
  const pageTitle =
    kind === "reprint"
      ? tagCount === 1
        ? "Reprint tag"
        : "Reprint tags"
      : kind === "batch" || tagCount > 1
        ? "Print tags"
        : "Print tag";
  const printLabel =
    kind === "reprint"
      ? tagCount === 1
        ? "Reprint tag"
        : `Reprint tags (${tagCount})`
      : tagCount === 1
        ? "Print tag"
        : `Print tags (${tagCount})`;
  const countLabel = tagCount === 1 ? "1 tag" : `${tagCount} tags`;
  const returnHref = ids.length === 1 ? `/inventory/${ids[0]}` : "/inventory";
  const returnLabel = ids.length === 1 ? "Back to article" : "Back to inventory";
  const successMessage = isReprint
    ? "Reprint recorded. Same barcode."
    : "Print recorded. Reprint uses the same barcode.";

  function openPrintDialog() {
    setPrintError(null);

    let settled = false;
    function askPhysicalConfirm() {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("afterprint", onAfterPrint);
      setAwaitingPhysical(true);
    }

    function onAfterPrint() {
      askPhysicalConfirm();
    }

    window.addEventListener("afterprint", onAfterPrint);
    window.print();
    window.setTimeout(askPhysicalConfirm, 1000);
  }

  async function confirmPrinted() {
    setRecording(true);
    setPrintError(null);
    try {
      const token = await inventoryAccessToken();
      for (const preview of previews) {
        await recordTagPrintRequest(token, preview.article_id, {
          print_kind: kind,
          template_version: TAG_TEMPLATE_VERSION,
          ...(reason ? { reason } : {}),
        });
      }
      setRecorded(true);
      setAwaitingPhysical(false);
    } catch (error) {
      setPrintError(inventoryErrorMessage(error));
    } finally {
      setRecording(false);
    }
  }

  function markPrintFailed() {
    setAwaitingPhysical(false);
    setPrintError("Print failed. The barcode is unchanged. Retry print when the printer is ready.");
  }

  return (
    <>
      <style>{`
        @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
        .tag-print-barcode svg {
          display: block;
          width: 100%;
          height: auto;
          max-height: var(--tag-barcode-max, ${barcodeMaxMm}mm);
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
          }
          .tag-print-actions,
          .tag-print-stage-chrome,
          .tag-print-frame-caption {
            display: none !important;
          }
          .tag-print-root {
            min-height: 0 !important;
            background: #fff !important;
            color: #000 !important;
          }
          .tag-print-stage {
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .tag-print-list {
            display: block !important;
            gap: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            grid-template-columns: none !important;
          }
          .tag-print-frame {
            display: contents;
          }
          .tag-print-stamp-enlarge-slot {
            width: auto !important;
            height: auto !important;
            display: contents;
          }
          .tag-print-stamp-enlarge {
            transform: none !important;
          }
          .tag-print-card {
            width: 100% !important;
            height: 100vh !important;
            max-height: ${heightMm}mm !important;
            margin: 0 !important;
            padding: 1mm !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .tag-print-card:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          .tag-print-barcode {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .tag-print-barcode svg {
            max-height: var(--tag-barcode-max, ${barcodeMaxMm}mm) !important;
          }
        }
      `}</style>

      <PrintPreviewChrome
        className="tag-print-root"
        headerClassName="tag-print-actions"
        stageClassName="tag-print-stage"
        title={pageTitle}
        metadata={
          <>
            {!loading && tagCount > 0 ? <span>{countLabel}</span> : null}
            {!loading && tagCount > 0 ? (
              <PrintPreviewPill>
                {widthMm} × {heightMm} mm
              </PrintPreviewPill>
            ) : null}
            {isReprint && reason ? <PrintPreviewPill>Reason: {reason}</PrintPreviewPill> : null}
          </>
        }
        helpers={
          <>
            <p className="text-md text-tertiary">
              {isReprint
                ? "Same barcode as before. Printer not confirmed — a preview is not proof that the physical tag is readable."
                : "Printer not confirmed. A preview is not proof that the physical tag is readable."}
            </p>
            <p className="text-sm text-tertiary">
              In the print dialog, turn off “Headers and footers” so date, title, and URL are not printed.
            </p>
          </>
        }
        primaryAction={
          <Button color="primary" size="lg" isDisabled={loading || tagCount === 0} onPress={openPrintDialog}>
            {printLabel}
          </Button>
        }
        secondaryAction={
          <Button color="secondary" size="lg" href={returnHref}>
            {returnLabel}
          </Button>
        }
        footer={
          <>
            {loadError ? <p className="text-sm text-error-primary">{loadError}</p> : null}
            {printError ? <p className="text-sm text-error-primary">{printError}</p> : null}
            {recorded ? <p className="text-sm text-success-primary">{successMessage}</p> : null}
            {awaitingPhysical && !recorded ? (
              <div className="flex flex-col gap-2 rounded-xl bg-secondary px-3 py-3 ring-1 ring-secondary">
                <div>
                  <p className="text-md font-semibold text-primary">Did the physical tag print?</p>
                  <p className="mt-0.5 text-sm text-tertiary">
                    If nothing printed (including Cancel), choose No, print failed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button color="primary" size="md" isLoading={recording} onPress={() => void confirmPrinted()}>
                    Yes, record print
                  </Button>
                  <Button color="secondary" size="md" isDisabled={recording} onPress={markPrintFailed}>
                    No, print failed
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        }
      >
        {loading ? (
          <TagPrintSkeleton showChrome={false} className="tag-print-stage-chrome print:hidden" label="Preparing tags…" />
        ) : null}

        <div
          className={
            tagCount > 1
              ? "tag-print-list mx-auto grid max-w-5xl grid-cols-2 justify-items-center gap-6"
              : "tag-print-list mx-auto flex max-w-5xl flex-col items-center gap-6"
          }
        >
          {previews.map((tag) => (
            <div key={tag.article_id} className="tag-print-frame flex flex-col items-center gap-2">
              <p className="tag-print-frame-caption text-sm text-tertiary print:hidden">
                {tag.article_number} · {tag.tag_width_mm} × {tag.tag_height_mm} mm
              </p>
              {tagCount === 1 ? (
                <div
                  className="tag-print-stamp-enlarge-slot flex items-center justify-center"
                  style={{
                    width: `calc(${tag.tag_width_mm}mm * 2)`,
                    height: `calc(${tag.tag_height_mm}mm * 2)`,
                  }}
                >
                  <div className="tag-print-stamp-enlarge origin-center scale-200">
                    <TagStamp tag={tag} />
                  </div>
                </div>
              ) : (
                <TagStamp tag={tag} />
              )}
            </div>
          ))}
        </div>
      </PrintPreviewChrome>
    </>
  );
}
