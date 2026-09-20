/**
 * Pure invoice and Girvi calculations live here.
 * This package must stay free of HTTP, React, database, and provider SDKs.
 */
export const domainPackage = "domain" as const;

export {
  permissionsForRole,
  roleHasPermission,
  STAFF_PERMISSION_MAP_VERSION,
} from "./staff-permissions";
export { kolkataBusinessDate, SHOP_TIME_ZONE } from "./business-date";
export {
  ARTICLE_STATUSES,
  INVENTORY_MOVEMENT_TYPES,
  SELLABLE_ARTICLE_STATUS,
  articleDeleteBlockedReason,
  articleIsMistakenReceiptDeletable,
  articleIsSellable,
  canAdjustArticleStatus,
  canReleaseFromInspection,
  isArticleStatus,
  netMetalWeightGrams,
  netMetalWeightIsPositive,
  netMetalWeightMatches,
} from "./article-inventory";
export type { ArticleStatus, InventoryMovementType } from "./article-inventory";
export {
  TAG_BARCODE_MIN_HEIGHT_MM,
  TAG_FOOTER_HEIGHT_MM,
  TAG_HEADER_HEIGHT_MM,
  TAG_INSET_MM,
  TAG_LOGO_MAX_MM,
  TAG_TEMPLATE_VERSION,
  articleBarcodePayload,
  isCode128SafePayload,
  tagBarcodeHeightMm,
  tagCanShowLogo,
  tagUsableHeightMm,
} from "./article-barcode";
export { SHOP_LOGO_MAX_BYTES, detectShopLogoContentType } from "./shop-logo";
export type { ShopLogoContentType } from "./shop-logo";
export {
  CUSTOMER_CONSENT_CHANNEL_WHATSAPP,
  CUSTOMER_CONSENT_PURPOSES,
  CUSTOMER_CONSENT_STATUSES,
  SHOP_PHONE_COUNTRY_CALLING_CODE,
  consentRequiresNormalizedPhone,
  customerInitials,
  isCustomerConsentPurpose,
  isE164Phone,
  normalizeShopPhone,
} from "./customer-contact";
export type {
  CustomerConsentChannel,
  CustomerConsentPurpose,
  CustomerConsentStatus,
  NormalizedShopPhone,
} from "./customer-contact";
export {
  DECIMAL_ROUNDING_MODES,
  MONEY_MAX_FRACTIONAL_DIGITS,
  MONEY_MAX_INTEGER_DIGITS,
  PERCENT_MAX_FRACTIONAL_DIGITS,
  RATE_MAX_FRACTIONAL_DIGITS,
  RATE_MAX_INTEGER_DIGITS,
  WEIGHT_MAX_FRACTIONAL_DIGITS,
  WEIGHT_MAX_INTEGER_DIGITS,
  assertFiniteDecimal,
  assertMoneyAmount,
  assertPercent,
  assertRatePerGram,
  assertWeightGrams,
  decimalFromString,
  decimalToPlainString,
  isDecimalRoundingMode,
  roundDecimal,
} from "./decimal";
export type { DecimalRoundingMode } from "./decimal";
export {
  APPROVED_DISCOUNT_METHODS,
  APPROVED_MAKING_CHARGE_METHODS,
  APPROVED_TAX_METHODS,
  APPROVED_WASTAGE_METHODS,
  CALCULATION_CURRENCIES,
  CALCULATION_POLICY_STATUSES,
  CALCULATION_RATE_UNITS,
  CALCULATION_WEIGHT_UNITS,
  INVOICE_V1_POLICY_METHODS,
  assertRoundingConfigured,
  calculationPolicyIsApproved,
  isApprovedDiscountMethod,
  isApprovedMakingChargeMethod,
  isApprovedTaxMethod,
  isApprovedWastageMethod,
  isCalculationPolicyStatus,
} from "./calculation-policy";
export type {
  ApprovedDiscountMethod,
  ApprovedMakingChargeMethod,
  ApprovedTaxMethod,
  ApprovedWastageMethod,
  CalculationCurrency,
  CalculationPolicy,
  CalculationPolicyStatus,
  CalculationRateUnit,
  CalculationWeightUnit,
} from "./calculation-policy";
export {
  CALCULATION_ERROR_CODES,
  CalculationDomainError,
  quoteInvoice,
} from "./invoice-quote";
export type {
  CalculationErrorCode,
  InvoiceDiscountInput,
  InvoiceQuoteInput,
  InvoiceQuoteLineBreakdown,
  InvoiceQuoteLineInput,
  InvoiceQuoteResult,
  LineDiscountInput,
  MakingChargeInput,
  StoneChargeInput,
  TaxInput,
  WastageInput,
} from "./invoice-quote";
