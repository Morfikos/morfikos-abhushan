import { createHash, randomUUID } from "node:crypto";

import type {
  GirviAccount,
  GirviAccountActivate,
  GirviAccountCreate,
  GirviAccountListItem,
  GirviAccountPatch,
  GirviAccountStatus,
  GirviCollateralFile,
  GirviCollateralFilePurpose,
  GirviCollateralFileUploadResult,
  GirviCollateralFileView,
  GirviCollateralItemInput,
  GirviCustodyEvent,
  GirviCustodyMoveCreate,
  GirviCustodyMoveResult,
  GirviReleaseEvent,
  PaymentMethod,
} from "@aabhushan/contracts";
import type { GirviCalculationPolicy, GirviLedgerEvent, GirviLedgerEventType } from "@aabhushan/domain";
import {
  buildGirviTermsSnapshot,
  detectShopLogoContentType,
  GIRVI_COLLATERAL_MAX_BYTES,
  girviAccountIsOverdue,
  kolkataBusinessDate,
} from "@aabhushan/domain";

import { assertPermission } from "./authorize";
import { configurationError, conflictError, notFoundError, validationError } from "./http-error";
import type { ResolvedStaffAccess } from "./staff-access";
import type { ShopAssetStorage } from "./shop-settings";

const ACTIVATE_OPERATION = "girvi.activate";
const CUSTODY_MOVE_OPERATION = "girvi.custody_move";

export type GirviListFilters = {
  page: number;
  pageSize: number;
  sort: "created_at" | "maturity_business_date" | "account_number" | "principal_inr";
  direction: "asc" | "desc";
  status?: GirviAccountStatus;
  customerId?: string;
  maturityFrom?: string;
  maturityTo?: string;
  /** Active and past maturity (Kolkata business date). */
  isOverdue?: boolean;
  q?: string;
};

export type GirviPostingLock = {
  id: string;
  accountNumber: string;
  status: string;
  customerId: string;
  principalInr: string;
  startBusinessDate: string;
  maturityBusinessDate: string;
  termsSnapshot: Record<string, unknown>;
  calculationPolicyVersion: string | null;
  rowVersion: number;
};

export type GirviRepository = {
  customerExists(customerId: string): Promise<boolean>;
  /** The owner-approved Girvi calculation policy, or null while none is approved. */
  findApprovedCalculationPolicy(): Promise<GirviCalculationPolicy | null>;
  /** Packet numbers already in custody for other accounts (or any in_custody row). */
  findInCustodyPacketConflicts(packetNumbers: string[], excludeAccountId?: string): Promise<string[]>;
  insertDraftAccount(input: {
    accountNumber: string;
    customerId: string;
    principalInr: string;
    startBusinessDate: string;
    maturityBusinessDate: string;
    termsSnapshot: Record<string, unknown>;
  }): Promise<string>;
  replaceCollateral(input: {
    accountId: string;
    items: GirviCollateralItemInput[];
    actorStaffUserId: string;
  }): Promise<void>;
  getAccount(accountId: string): Promise<GirviAccount | null>;
  listAccounts(filters: GirviListFilters): Promise<{ items: GirviAccountListItem[]; total: number }>;
  /** Returns collateral file object keys before cascade-delete so storage can be cleaned. */
  listCollateralObjectKeys(accountId: string): Promise<string[]>;
  /** Hard-deletes a draft account. Child tables cascade. */
  deleteDraftAccount(accountId: string, expectedRowVersion: number): Promise<boolean>;
  updateDraftAccount(input: {
    accountId: string;
    expectedRowVersion: number;
    principalInr?: string;
    startBusinessDate?: string;
    maturityBusinessDate?: string;
    termsSnapshot?: Record<string, unknown>;
  }): Promise<boolean>;
  lockDraftForActivate(accountId: string): Promise<{
    id: string;
    status: string;
    customerId: string;
    principalInr: string;
    startBusinessDate: string;
    maturityBusinessDate: string;
    interestRatePercentPer30Days: string | null;
    rowVersion: number;
    packetNumbers: string[];
    /** Packet numbers for items that still have zero photos. */
    packetsMissingPhotos: string[];
  } | null>;
  allocateGirviAccountNumber(): Promise<string>;
  activateAccount(input: {
    accountId: string;
    expectedRowVersion: number;
    accountNumber: string;
    termsSnapshot: Record<string, unknown>;
    calculationPolicyVersion: string | null;
    activatedByStaffUserId: string;
  }): Promise<boolean>;
  insertCustodyReceivedEvents(input: {
    accountId: string;
    actorStaffUserId: string;
  }): Promise<void>;
  insertDisbursement(input: {
    accountId: string;
    effectiveBusinessDate: string;
    principalInr: string;
    actorStaffUserId: string;
    eventKey: string;
  }): Promise<void>;
  writeAudit(event: {
    actorStaffUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  findIdempotency(input: {
    operation: string;
    key: string;
  }): Promise<{ requestHash: string; responseStatus: number; responseBody: unknown } | null>;
  insertIdempotency(input: {
    operation: string;
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
  insertOutbox(input: {
    eventKey: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  /** Always false — packet barcodes are never articles. Used by verification. */
  articleExistsWithBarcode(barcode: string): Promise<boolean>;

  /** `SELECT … FOR UPDATE` so two repayments cannot allocate the same funds. */
  lockAccountForPosting(accountId: string): Promise<GirviPostingLock | null>;
  /** Posted, immutable events replayed by the domain engine. */
  loadLedgerEvents(accountId: string): Promise<GirviLedgerEvent[]>;
  nextPostingSequence(accountId: string, businessDate: string): Promise<number>;
  latestLedgerBusinessDate(accountId: string): Promise<string | null>;
  insertFinancialEvent(input: {
    accountId: string;
    eventType: GirviLedgerEventType;
    effectiveBusinessDate: string;
    principalDeltaInr: string;
    interestDeltaInr: string;
    amountInr: string;
    method?: PaymentMethod;
    notes?: string;
    postingSequence: number;
    actorStaffUserId: string;
    eventKey: string;
  }): Promise<string>;
  updateBalanceProjections(input: {
    accountId: string;
    principalOutstandingInr: string;
    interestOutstandingInr: string;
  }): Promise<void>;
  markAccountSettled(input: { accountId: string; actorStaffUserId: string }): Promise<void>;
  findLatestSettlementEventId(accountId: string): Promise<string | null>;
  listInCustodyPacketNumbers(accountId: string): Promise<string[]>;
  findReleaseEvent(accountId: string): Promise<GirviReleaseEvent | null>;
  insertReleaseEvent(input: {
    accountId: string;
    settlementEventId: string | null;
    packetNumbersVerified: string[];
    staffAcknowledgedBy: string;
    customerAcknowledged: boolean;
    recipientName: string;
    waiverReason?: string;
    notes?: string;
  }): Promise<GirviReleaseEvent>;
  /** Marks collateral released, writes custody `released` events, and sets account status. */
  releaseCollateral(input: {
    accountId: string;
    actorStaffUserId: string;
    recipientName: string;
    notes?: string;
  }): Promise<void>;

  /** Lock one collateral item for a location move. */
  lockCollateralItemForMove(
    accountId: string,
    collateralItemId: string,
  ): Promise<{
    accountStatus: string;
    itemId: string;
    packetNumber: string;
    custodyLocation: string;
    itemStatus: string;
  } | null>;

  /** Update location and insert a location_changed custody event. */
  moveCollateralLocation(input: {
    accountId: string;
    collateralItemId: string;
    custodyLocation: string;
    actorStaffUserId: string;
    notes?: string;
  }): Promise<GirviCustodyEvent>;

  /** Draft-only: confirm the collateral item belongs to this account. */
  lockDraftCollateralItem(
    accountId: string,
    collateralItemId: string,
  ): Promise<{ accountStatus: string; itemId: string } | null>;

  insertCollateralFile(input: {
    accountId: string;
    collateralItemId: string;
    objectKey: string;
    checksumSha256: string;
    purpose: string;
    uploadedByStaffUserId: string;
  }): Promise<GirviCollateralFile>;

  getCollateralFile(
    accountId: string,
    collateralItemId: string,
    fileId: string,
  ): Promise<GirviCollateralFile | null>;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function hashGirviActivatePayload(accountId: string, body: GirviAccountActivate): string {
  return createHash("sha256").update(canonicalJson({ account_id: accountId, ...body })).digest("hex");
}

export function hashGirviCustodyMovePayload(accountId: string, body: GirviCustodyMoveCreate): string {
  return createHash("sha256").update(canonicalJson({ account_id: accountId, ...body })).digest("hex");
}

function assertDistinctPackets(items: GirviCollateralItemInput[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.packet_number.trim().toLowerCase();
    if (seen.has(key)) {
      throw conflictError("PACKET_CONFLICT", `Packet number ${item.packet_number} is duplicated on this account.`);
    }
    seen.add(key);
  }
}

async function assertNoPacketConflicts(
  repo: GirviRepository,
  items: GirviCollateralItemInput[],
  excludeAccountId?: string,
): Promise<void> {
  const packets = items.map((item) => item.packet_number);
  const conflicts = await repo.findInCustodyPacketConflicts(packets, excludeAccountId);
  if (conflicts.length > 0) {
    throw conflictError(
      "PACKET_CONFLICT",
      `Packet number already in custody: ${conflicts.join(", ")}.`,
    );
  }
}

function termsSnapshotRecord(input: {
  principalInr: string;
  startBusinessDate: string;
  maturityBusinessDate: string;
  interestRatePercentPer30Days: string | null;
  policy: GirviCalculationPolicy | null;
}): Record<string, unknown> {
  return buildGirviTermsSnapshot(input) as unknown as Record<string, unknown>;
}

/** The rate a draft already carries, read back from its frozen-terms shape. */
export function girviRateFromTermsSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const interest = (snapshot as { interest?: unknown }).interest;
  if (!interest || typeof interest !== "object") {
    return null;
  }
  const rate = (interest as { rate_percent_per_30_days?: unknown }).rate_percent_per_30_days;
  return typeof rate === "string" ? rate : null;
}

export async function createGirviDraft(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  body: GirviAccountCreate,
): Promise<GirviAccount> {
  assertPermission(access, "girvi.write");

  if (!(await repo.customerExists(body.customer_id))) {
    throw notFoundError("Customer not found.");
  }

  assertDistinctPackets(body.collateral);
  await assertNoPacketConflicts(repo, body.collateral);

  const policy = await repo.findApprovedCalculationPolicy();
  const terms = termsSnapshotRecord({
    principalInr: body.principal_inr,
    startBusinessDate: body.start_business_date,
    maturityBusinessDate: body.maturity_business_date,
    interestRatePercentPer30Days: body.interest_rate_percent_per_30_days ?? null,
    policy,
  });

  const draftNumber = `DRAFT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const accountId = await repo.insertDraftAccount({
    accountNumber: draftNumber,
    customerId: body.customer_id,
    principalInr: body.principal_inr,
    startBusinessDate: body.start_business_date,
    maturityBusinessDate: body.maturity_business_date,
    termsSnapshot: terms,
  });

  await repo.replaceCollateral({
    accountId,
    items: body.collateral,
    actorStaffUserId: access.staff_user_id,
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.draft.create",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      customer_id: body.customer_id,
      principal_inr: body.principal_inr,
      collateral_count: body.collateral.length,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after create.");
  }
  return account;
}

export async function getGirviAccount(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
): Promise<GirviAccount> {
  assertPermission(access, "girvi.write");
  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found.");
  }
  return account;
}

export async function listGirviAccounts(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  filters: GirviListFilters,
): Promise<{ items: GirviAccountListItem[]; total: number }> {
  assertPermission(access, "girvi.write");
  return repo.listAccounts(filters);
}

export async function patchGirviDraft(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviAccountPatch,
): Promise<GirviAccount> {
  assertPermission(access, "girvi.write");

  const existing = await repo.getAccount(accountId);
  if (!existing) {
    throw notFoundError("Girvi account not found.");
  }
  if (existing.status !== "draft") {
    throw validationError("Only draft Girvi accounts can be edited. Collateral cannot be added after activation.");
  }

  if (body.collateral) {
    assertDistinctPackets(body.collateral);
    await assertNoPacketConflicts(repo, body.collateral, accountId);
  }

  const principalInr = body.principal_inr ?? existing.principal_inr;
  const startBusinessDate = body.start_business_date ?? existing.start_business_date;
  const maturityBusinessDate = body.maturity_business_date ?? existing.maturity_business_date;
  if (maturityBusinessDate < startBusinessDate) {
    throw validationError("Maturity must be on or after the start date.", [
      { field: "maturity_business_date", message: "Maturity must be on or after the start date." },
    ]);
  }

  const policy = await repo.findApprovedCalculationPolicy();
  const terms = termsSnapshotRecord({
    principalInr,
    startBusinessDate,
    maturityBusinessDate,
    interestRatePercentPer30Days:
      body.interest_rate_percent_per_30_days ?? girviRateFromTermsSnapshot(existing.terms_snapshot),
    policy,
  });

  const updated = await repo.updateDraftAccount({
    accountId,
    expectedRowVersion: body.row_version,
    ...(body.principal_inr !== undefined ? { principalInr: body.principal_inr } : {}),
    ...(body.start_business_date !== undefined ? { startBusinessDate: body.start_business_date } : {}),
    ...(body.maturity_business_date !== undefined ? { maturityBusinessDate: body.maturity_business_date } : {}),
    termsSnapshot: terms,
  });
  if (!updated) {
    throw conflictError("STALE_VERSION", "This draft changed. Refresh and try again.");
  }

  if (body.collateral) {
    await repo.replaceCollateral({
      accountId,
      items: body.collateral,
      actorStaffUserId: access.staff_user_id,
    });
  }

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.draft.patch",
    entityType: "girvi_account",
    entityId: accountId,
    payload: { row_version: body.row_version },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after patch.");
  }
  return account;
}

/**
 * Discard a draft that was never activated. Activated money and custody stay
 * immutable — only a draft with no disbursement can be removed.
 */
export async function deleteGirviDraft(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  expectedRowVersion: number,
  storage?: { removeObject(objectKey: string): Promise<void> } | null,
): Promise<void> {
  assertPermission(access, "girvi.write");

  const existing = await repo.getAccount(accountId);
  if (!existing) {
    throw notFoundError("Girvi account not found.");
  }
  if (existing.status !== "draft") {
    throw validationError("Only a draft Girvi account can be discarded. Activated accounts keep their history.");
  }
  if (existing.row_version !== expectedRowVersion) {
    throw conflictError("STALE_VERSION", "This draft changed. Refresh and try again.");
  }

  const objectKeys = await repo.listCollateralObjectKeys(accountId);

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.draft.discard",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      account_number: existing.account_number,
      customer_id: existing.customer_id,
      object_keys_removed: objectKeys.length,
    },
  });

  const deleted = await repo.deleteDraftAccount(accountId, expectedRowVersion);
  if (!deleted) {
    throw conflictError("STALE_VERSION", "This draft changed. Refresh and try again.");
  }

  if (storage) {
    for (const objectKey of objectKeys) {
      await storage.removeObject(objectKey).catch(() => undefined);
    }
  }
}

export async function activateGirviAccount(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviAccountActivate,
  idempotencyKey: string | undefined,
): Promise<GirviAccount> {
  assertPermission(access, "girvi.write");

  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw validationError("Idempotency-Key is required to activate a Girvi account.", [
      { field: "Idempotency-Key", message: "Required for activation." },
    ]);
  }

  const requestHash = hashGirviActivatePayload(accountId, body);
  const existingKey = await repo.findIdempotency({ operation: ACTIVATE_OPERATION, key: idempotencyKey });
  if (existingKey) {
    if (existingKey.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSE",
        "This Idempotency-Key was already used with a different activation payload.",
      );
    }
    return existingKey.responseBody as GirviAccount;
  }

  const locked = await repo.lockDraftForActivate(accountId);
  if (!locked) {
    throw notFoundError("Girvi account not found.");
  }
  if (locked.status !== "draft") {
    throw validationError("Only draft Girvi accounts can be activated.");
  }
  if (locked.rowVersion !== body.row_version) {
    throw conflictError("STALE_VERSION", "This draft changed. Refresh and try again.");
  }
  if (locked.packetNumbers.length === 0) {
    throw validationError("Add at least one collateral item before activation.", [
      { field: "collateral", message: "At least one collateral item is required." },
    ]);
  }
  if (locked.packetsMissingPhotos.length > 0) {
    throw validationError("Each collateral item needs at least one photo before activation.", [
      {
        field: "collateral",
        message: `Add a photo for packet(s): ${locked.packetsMissingPhotos.join(", ")}.`,
      },
    ]);
  }

  const rate = locked.interestRatePercentPer30Days?.trim() ?? "";
  if (!rate || Number.parseFloat(rate) <= 0 || Number.parseFloat(rate) > 100) {
    throw validationError(
      "Enter the interest rate as a percentage per 30 days before activating this account.",
      [
        {
          field: "interest_rate_percent_per_30_days",
          message: "Enter the interest rate as a percentage per 30 days, above 0 and up to 100.",
        },
      ],
    );
  }

  if (body.confirm_principal_inr !== locked.principalInr) {
    throw validationError("Confirmed principal does not match the draft.", [
      { field: "confirm_principal_inr", message: "Must match the draft principal." },
    ]);
  }

  const expectedPackets = [...locked.packetNumbers].map((p) => p.trim()).sort();
  const confirmedPackets = [...body.confirm_packet_numbers].map((p) => p.trim()).sort();
  if (
    expectedPackets.length !== confirmedPackets.length ||
    expectedPackets.some((packet, index) => packet !== confirmedPackets[index])
  ) {
    throw validationError("Confirmed packet numbers must match the collateral on this draft.", [
      { field: "confirm_packet_numbers", message: "List every packet number on the draft." },
    ]);
  }

  // Freeze the approved method and rate here. Activation already requires a
  // positive rate; accounts activated earlier without one keep unsupported terms.
  const policy = await repo.findApprovedCalculationPolicy();
  const terms = buildGirviTermsSnapshot({
    principalInr: locked.principalInr,
    startBusinessDate: locked.startBusinessDate,
    maturityBusinessDate: locked.maturityBusinessDate,
    interestRatePercentPer30Days: rate,
    policy,
  });

  const accountNumber = await repo.allocateGirviAccountNumber();
  const activated = await repo.activateAccount({
    accountId,
    expectedRowVersion: body.row_version,
    accountNumber,
    termsSnapshot: terms as unknown as Record<string, unknown>,
    calculationPolicyVersion: terms.interest.status === "approved" ? terms.interest.policy_version : null,
    activatedByStaffUserId: access.staff_user_id,
  });
  if (!activated) {
    throw conflictError("STALE_VERSION", "This draft changed. Refresh and try again.");
  }

  await repo.insertCustodyReceivedEvents({
    accountId,
    actorStaffUserId: access.staff_user_id,
  });

  const eventKey = `girvi.disbursement:${accountId}`;
  await repo.insertDisbursement({
    accountId,
    effectiveBusinessDate: locked.startBusinessDate,
    principalInr: locked.principalInr,
    actorStaffUserId: access.staff_user_id,
    eventKey,
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.activate",
    entityType: "girvi_account",
    entityId: accountId,
    payload: {
      account_number: accountNumber,
      customer_id: locked.customerId,
      principal_inr: locked.principalInr,
      packet_numbers: locked.packetNumbers,
    },
  });

  await repo.insertOutbox({
    eventKey: `girvi.activated:${accountId}`,
    eventType: "girvi.activated",
    payload: {
      girvi_account_id: accountId,
      account_number: accountNumber,
      customer_id: locked.customerId,
    },
  });
  await repo.insertOutbox({
    eventKey: `whatsapp.send.requested:girvi_reminder:activated:${accountId}`,
    eventType: "whatsapp.send.requested",
    payload: {
      purpose: "girvi_reminder",
      customer_id: locked.customerId,
      related_type: "girvi",
      related_id: accountId,
      dedupe_key: `girvi_reminder:activated:${accountId}`,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after activation.");
  }

  await repo.insertIdempotency({
    operation: ACTIVATE_OPERATION,
    key: idempotencyKey,
    requestHash,
    responseStatus: 200,
    responseBody: account,
  });

  return account;
}

/**
 * Move a sealed packet to a different shelf/locker while it stays in custody.
 * Not an inventory movement — collateral never becomes shop stock.
 */
export async function moveGirviCustodyLocation(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  accountId: string,
  body: GirviCustodyMoveCreate,
  idempotencyKey: string | undefined,
): Promise<GirviCustodyMoveResult> {
  assertPermission(access, "girvi.write");

  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw validationError("Idempotency-Key is required to move a Girvi packet.", [
      { field: "Idempotency-Key", message: "Required for custody moves." },
    ]);
  }

  const requestHash = hashGirviCustodyMovePayload(accountId, body);
  const existingKey = await repo.findIdempotency({ operation: CUSTODY_MOVE_OPERATION, key: idempotencyKey });
  if (existingKey) {
    if (existingKey.requestHash !== requestHash) {
      throw conflictError(
        "IDEMPOTENCY_KEY_REUSE",
        "This Idempotency-Key was already used with a different custody-move payload.",
      );
    }
    return existingKey.responseBody as GirviCustodyMoveResult;
  }

  const locked = await repo.lockCollateralItemForMove(accountId, body.collateral_item_id);
  if (!locked) {
    throw notFoundError("Collateral item not found on this Girvi account.");
  }
  if (locked.accountStatus === "draft") {
    throw validationError("Activate the account before moving packet locations.");
  }
  if (locked.accountStatus === "released") {
    throw validationError("Released packets cannot change location.", [
      { field: "collateral_item_id", message: "Account is already released." },
    ]);
  }
  if (locked.accountStatus !== "active" && locked.accountStatus !== "settled") {
    throw validationError("Packet location can only change while the account is active or settled.");
  }
  if (locked.itemStatus !== "in_custody") {
    throw validationError("Only packets still in custody can change location.", [
      { field: "collateral_item_id", message: "Item is not in custody." },
    ]);
  }
  if (locked.custodyLocation === body.custody_location) {
    throw validationError("Choose a different custody location.", [
      { field: "custody_location", message: "Must differ from the current location." },
    ]);
  }

  const custodyEvent = await repo.moveCollateralLocation({
    accountId,
    collateralItemId: body.collateral_item_id,
    custodyLocation: body.custody_location,
    actorStaffUserId: access.staff_user_id,
    ...(body.notes ? { notes: body.notes } : {}),
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.custody.location_changed",
    entityType: "girvi_collateral_item",
    entityId: body.collateral_item_id,
    payload: {
      girvi_account_id: accountId,
      packet_number: locked.packetNumber,
      from_location: locked.custodyLocation,
      to_location: body.custody_location,
    },
  });

  await repo.insertOutbox({
    eventKey: `girvi.custody_moved:${custodyEvent.id}`,
    eventType: "girvi.custody_moved",
    payload: {
      girvi_account_id: accountId,
      collateral_item_id: body.collateral_item_id,
      packet_number: locked.packetNumber,
      custody_location: body.custody_location,
    },
  });

  const account = await repo.getAccount(accountId);
  if (!account) {
    throw notFoundError("Girvi account not found after custody move.");
  }

  const result: GirviCustodyMoveResult = { account, custody_event: custodyEvent };
  await repo.insertIdempotency({
    operation: CUSTODY_MOVE_OPERATION,
    key: idempotencyKey,
    requestHash,
    responseStatus: 201,
    responseBody: result,
  });

  return result;
}

const COLLATERAL_SIGNED_URL_SECONDS = 900;

/**
 * Upload a private collateral or packet photo into shop-assets. Draft accounts only —
 * activated packets keep their photo set immutable in this unit.
 */
export async function uploadGirviCollateralFile(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  storage: ShopAssetStorage | null,
  input: {
    accountId: string;
    collateralItemId: string;
    bytes: Buffer;
    declaredContentType: string;
    purpose: GirviCollateralFilePurpose;
  },
): Promise<GirviCollateralFileUploadResult> {
  assertPermission(access, "girvi.write");

  if (!storage) {
    throw configurationError(
      "Shop asset storage is not configured. Set SUPABASE_SECRET_KEY and create the shop-assets bucket.",
    );
  }
  if (input.bytes.length === 0 || input.bytes.length > GIRVI_COLLATERAL_MAX_BYTES) {
    throw validationError("Collateral photo must be between 1 byte and 5 MB.", [
      { field: "file", message: "Maximum size is 5 MB." },
    ]);
  }
  const detected = detectShopLogoContentType(input.bytes);
  if (!detected) {
    throw validationError("Collateral photo must be a JPEG, PNG, or WebP image.", [
      { field: "file", message: "Unrecognized image bytes." },
    ]);
  }
  if (
    input.declaredContentType &&
    input.declaredContentType !== detected &&
    !(input.declaredContentType === "image/jpg" && detected === "image/jpeg")
  ) {
    throw validationError("Declared content type does not match the image bytes.", [
      { field: "file", message: `Expected ${detected}.` },
    ]);
  }

  const locked = await repo.lockDraftCollateralItem(input.accountId, input.collateralItemId);
  if (!locked) {
    throw notFoundError("Collateral item not found on this Girvi account.");
  }
  if (locked.accountStatus !== "draft") {
    throw validationError("Photos can only be added while the Girvi account is still a draft.");
  }

  const ext = detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : "webp";
  const objectKey = `${access.membership.organization_id}/girvi/${input.accountId}/${input.collateralItemId}/${randomUUID()}.${ext}`;

  const uploaded = await storage.uploadPrivateObject({
    objectKey,
    bytes: input.bytes,
    contentType: detected,
  });

  const file = await repo.insertCollateralFile({
    accountId: input.accountId,
    collateralItemId: input.collateralItemId,
    objectKey: uploaded.objectKey,
    checksumSha256: uploaded.checksumSha256,
    purpose: input.purpose,
    uploadedByStaffUserId: access.staff_user_id,
  });

  await repo.writeAudit({
    actorStaffUserId: access.staff_user_id,
    action: "girvi.collateral.file.upload",
    entityType: "girvi_collateral_file",
    entityId: file.id,
    payload: {
      girvi_account_id: input.accountId,
      collateral_item_id: input.collateralItemId,
      purpose: input.purpose,
      checksum_sha256: uploaded.checksumSha256,
      byte_size: uploaded.byteSize,
    },
  });

  let signedUrl: string | null = null;
  try {
    signedUrl = await storage.createSignedUrl(uploaded.objectKey, COLLATERAL_SIGNED_URL_SECONDS);
  } catch {
    signedUrl = null;
  }

  return { file, signed_url: signedUrl };
}

/** Short-lived signed URL for staff viewing a private collateral photo. */
export async function getGirviCollateralFileView(
  repo: GirviRepository,
  access: ResolvedStaffAccess,
  storage: ShopAssetStorage | null,
  input: { accountId: string; collateralItemId: string; fileId: string },
): Promise<GirviCollateralFileView> {
  assertPermission(access, "girvi.write");

  if (!storage) {
    throw configurationError(
      "Shop asset storage is not configured. Set SUPABASE_SECRET_KEY and create the shop-assets bucket.",
    );
  }

  const file = await repo.getCollateralFile(input.accountId, input.collateralItemId, input.fileId);
  if (!file) {
    throw notFoundError("Collateral file not found.");
  }

  const purpose =
    file.purpose === "packet_photo" || file.purpose === "collateral_photo"
      ? file.purpose
      : "collateral_photo";

  const signedUrl = await storage.createSignedUrl(file.object_key, COLLATERAL_SIGNED_URL_SECONDS);
  return {
    id: file.id,
    purpose,
    checksum_sha256: file.checksum_sha256,
    signed_url: signedUrl,
    expires_in_seconds: COLLATERAL_SIGNED_URL_SECONDS,
  };
}

/** Pure helper exported for UI/tests: overdue label never implies shop stock. */
export function presentGirviOverdue(status: string, maturityBusinessDate: string, asOf = kolkataBusinessDate()): boolean {
  return girviAccountIsOverdue({ status, maturityBusinessDate, asOfBusinessDate: asOf });
}
