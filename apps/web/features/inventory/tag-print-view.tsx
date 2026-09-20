"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TAG_LOGO_MAX_MM, TAG_TEMPLATE_VERSION } from "@aabhushan/domain";
import type { TagPreview, TagPrintKind } from "@aabhushan/contracts";

import { Button } from "@/components/base/buttons/button";
import { inventoryAccessToken, inventoryErrorMessage } from "@/features/inventory/inventory-shared";
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

function TagStamp({ tag }: { tag: TagPreview }) {
  const showLogo = Boolean(tag.logo_data_uri);
  const barcodeMaxHeight = `${tag.barcode_height_mm}mm`;

  return (
    <article
      className="tag-print-card flex flex-col overflow-visible border border-black bg-white text-black shadow-xs"
      style={{ width: `${tag.tag_width_mm}mm`, height: `${tag.tag_height_mm}mm`, padding: "1mm" }}
    >
      <div className="flex h-[3.5mm] shrink-0 items-center justify-between gap-1 overflow-visible">
        {showLogo ? (
          <img
            src={tag.logo_data_uri!}
            alt=""
            className="object-contain"
            style={{ width: `${TAG_LOGO_MAX_MM}mm`, height: `${TAG_LOGO_MAX_MM}mm`, maxHeight: "3.5mm" }}
          />
        ) : (
          <p className="max-w-[62%] truncate text-[6px] font-semibold leading-none tracking-tight text-black">
            {tag.legal_name}
          </p>
        )}
        <p className="shrink-0 text-[6px] capitalize leading-none text-neutral-700">
          {tag.metal} {tag.purity}
        </p>
      </div>
      <div
        className="tag-print-barcode flex min-h-0 flex-1 items-center justify-center overflow-visible px-0.5"
        style={{ ["--tag-barcode-max" as string]: barcodeMaxHeight }}
        dangerouslySetInnerHTML={{ __html: tag.barcode_svg }}
      />
      <div className="flex h-[3mm] shrink-0 items-end justify-between gap-1">
        <p className="font-mono text-[7px] leading-none text-neutral-800">{tag.barcode}</p>
        <p className="text-[6px] font-medium tabular-nums leading-none text-neutral-800">
          {tag.net_metal_weight_grams} g
        </p>
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
  const pageTitle = tagCount === 1 ? "Print tag" : "Print tags";
  const printLabel = tagCount === 1 ? "Print tag" : `Print tags (${tagCount})`;
  const countLabel = tagCount === 1 ? "1 tag" : `${tagCount} tags`;
  const logoOmitted = previews.some((tag) => tag.logo_omitted_for_height);

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
    <main className="tag-print-root min-h-screen bg-secondary text-primary print:bg-white print:text-black">
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
            padding-left: 0.5mm !important;
            padding-right: 0.5mm !important;
          }
          .tag-print-barcode svg {
            max-height: var(--tag-barcode-max, ${barcodeMaxMm}mm) !important;
          }
        }
      `}</style>

      <div className="tag-print-actions sticky top-0 z-10 border-b border-secondary bg-primary print:hidden">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex flex-col gap-1">
              <h1 className="text-lg font-semibold text-primary">{pageTitle}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-tertiary">
                {!loading && tagCount > 0 ? <span>{countLabel}</span> : null}
                {!loading && tagCount > 0 ? (
                  <span className="rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary ring-1 ring-secondary ring-inset">
                    {widthMm} × {heightMm} mm
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-tertiary">
                Printer not confirmed. A preview is not proof that the physical tag is readable.
              </p>
              {logoOmitted ? (
                <p className="text-sm text-warning-primary">
                  Tag too short for logo + scannable barcode; shop name is used instead.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button color="primary" size="md" isDisabled={loading || tagCount === 0} onPress={openPrintDialog}>
                {printLabel}
              </Button>
              <Button color="secondary" size="md" href="/inventory">
                Back to inventory
              </Button>
            </div>
          </div>

          {loadError ? <p className="text-sm text-error-primary">{loadError}</p> : null}
          {printError ? <p className="text-sm text-error-primary">{printError}</p> : null}
          {recorded ? <p className="text-sm text-success-primary">Print recorded. Reprint uses the same barcode.</p> : null}

          {awaitingPhysical && !recorded ? (
            <div className="flex flex-col gap-2 rounded-xl bg-secondary px-3 py-3 ring-1 ring-secondary">
              <div>
                <p className="text-sm font-semibold text-primary">Did the physical tag print?</p>
                <p className="mt-0.5 text-xs text-tertiary">
                  If nothing printed (including Cancel), choose No, print failed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button color="primary" size="sm" isLoading={recording} onPress={() => void confirmPrinted()}>
                  Yes, record print
                </Button>
                <Button color="secondary" size="sm" isDisabled={recording} onPress={markPrintFailed}>
                  No, print failed
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? <p className="tag-print-stage-chrome px-4 py-6 text-sm text-tertiary print:hidden">Preparing tags…</p> : null}

      <div className="tag-print-stage px-4 py-6 print:p-0">
        <div className="tag-print-list mx-auto grid max-w-5xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {previews.map((tag) => (
            <div key={tag.article_id} className="tag-print-frame flex flex-col items-center gap-2">
              <p className="tag-print-frame-caption text-xs text-tertiary print:hidden">
                {tag.article_number} · {tag.tag_width_mm} × {tag.tag_height_mm} mm
              </p>
              <TagStamp tag={tag} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
