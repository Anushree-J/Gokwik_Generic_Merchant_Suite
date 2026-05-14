// @ts-nocheck
// ---------------------------------------------------------------------------
// Runtime inputs for the Generic Merchant Suite. All env-driven so the same
// test can run against any merchant storefront without code edits.
//
// Every BRD-derived input is OPTIONAL. The matching test step is skipped
// when its value is unset — so merchants that haven't configured a feature
// (e.g. no prepaid discount) still pass the suite.
// ---------------------------------------------------------------------------

const env = (k: string, fallback = '') => (process.env[k] ?? fallback).trim();
const envBool = (k: string) => /^(y|yes|true|1)$/i.test(env(k));
const envNum = (k: string): number | null => {
  const v = env(k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const envList = (k: string, sep = ','): string[] =>
  env(k).split(sep).map((s) => s.trim()).filter(Boolean);

// --- Core flow inputs ------------------------------------------------------
export const SITE_URL =
  process.env.SITE_URL ?? 'https://sandbox-auto.myshopify.com';

export const PRODUCT_NAME =
  process.env.PRODUCT_NAME ?? '5 Pocket Jean';

export const DISCOUNT_CODE =
  process.env.DISCOUNT_CODE ?? '';

export const PHONE_NUMBER = process.env.PHONE_NUMBER ?? '';

// Skip the Add-to-Cart click and open checkout directly (e.g. via "Buy Now").
export const SKIP_ATC =
  (process.env.SKIP_ATC ?? '').toLowerCase() === 'true';

// --- BRD §1: Primary brand colour -----------------------------------------
// 6-digit hex (with or without leading '#') of the merchant's primary colour.
export const BRAND_COLOR_HEX = env('BRAND_COLOR_HEX');

// --- BRD §2: Prepaid discount ---------------------------------------------
// _ENABLED gates the whole step. The remaining fields parameterise the check.
export const PREPAID_DISCOUNT_ENABLED  = envBool('PREPAID_DISCOUNT_ENABLED');
export const PREPAID_DISCOUNT_SCOPE    = env('PREPAID_DISCOUNT_SCOPE');   // 'all' | 'upi'
export const PREPAID_DISCOUNT_TYPE     = env('PREPAID_DISCOUNT_TYPE');    // 'flat' | 'percent'
export const PREPAID_DISCOUNT_VALUE    = envNum('PREPAID_DISCOUNT_VALUE');
export const PREPAID_DISCOUNT_CAP      = envNum('PREPAID_DISCOUNT_CAP');
export const PREPAID_DISCOUNT_MIN_CART = envNum('PREPAID_DISCOUNT_MIN_CART');

// --- BRD §3: Payment methods enabled --------------------------------------
// Comma-separated subset of: UPI, COD, PPCOD, Cards, Netbanking, Wallets,
// Snapmint, EMI (case-insensitive). Each named method must be visible in
// the GoKwik payment section.
export const PAYMENT_METHODS = envList('PAYMENT_METHODS');

// --- BRD §4: Discount list shown on checkout ------------------------------
// Comma-separated coupon codes that the merchant expects to be visible in
// the GoKwik coupon list (regardless of eligibility — visibility only).
export const EXPECTED_DISCOUNT_CODES = envList('EXPECTED_DISCOUNT_CODES');

// --- BRD §5: Shipping -----------------------------------------------------
export const SHIPPING_NAME  = env('SHIPPING_NAME');
export const SHIPPING_PRICE = envNum('SHIPPING_PRICE');

// --- BRD §6: COD fees -----------------------------------------------------
export const COD_FEE_ENABLED = envBool('COD_FEE_ENABLED');
export const COD_FEE_VALUE   = envNum('COD_FEE_VALUE');

// --- BRD §8: Tax setup ----------------------------------------------------
// _SHOW_ON_CHECKOUT=true asserts a tax line is visible in the summary.
// _INCLUSIVE=true asserts "Inclusive of taxes" text appears.
export const TAX_SHOW_ON_CHECKOUT = envBool('TAX_SHOW_ON_CHECKOUT');
export const TAX_INCLUSIVE        = envBool('TAX_INCLUSIVE');

// --- BRD §9: GA4 ----------------------------------------------------------
// Measurement ID like "G-XXXXXXX". Setting this asserts GA4 events landed
// on that ID (in addition to the existing required-event-name checks).
export const GA4_MEASUREMENT_ID = env('GA4_MEASUREMENT_ID');

// --- BRD §10: Meta Pixel --------------------------------------------------
// Pixel ID (numeric). Asserts Meta events landed on that pixel.
export const META_PIXEL_ID = env('META_PIXEL_ID');

// --- BRD §11: Google Ads --------------------------------------------------
// Adwords ID like "AW-XXXXXXX" + the two expected conversion labels.
export const GADS_ADWORDS_ID           = env('GADS_ADWORDS_ID');
export const GADS_PURCHASE_LABEL       = env('GADS_PURCHASE_LABEL');
export const GADS_BEGIN_CHECKOUT_LABEL = env('GADS_BEGIN_CHECKOUT_LABEL');

// --- BRD §12: COD limit ---------------------------------------------------
// At runtime, COD visibility for the *current* cart value is checked
// against this range. Outside-range carts must hide the COD tile.
export const COD_LIMIT_LOWER = envNum('COD_LIMIT_LOWER');
export const COD_LIMIT_UPPER = envNum('COD_LIMIT_UPPER');
