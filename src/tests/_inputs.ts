// @ts-nocheck
// ---------------------------------------------------------------------------
// Runtime inputs for the Generic Merchant Suite. All env-driven so the same
// test can run against any merchant storefront without code edits.
// ---------------------------------------------------------------------------
export const SITE_URL =
  process.env.SITE_URL ?? 'https://sandbox-auto.myshopify.com';

export const PRODUCT_NAME =
  process.env.PRODUCT_NAME ?? '5 Pocket Jean';

export const DISCOUNT_CODE =
  process.env.DISCOUNT_CODE ?? '';

export const PHONE_NUMBER = process.env.PHONE_NUMBER ?? '';

// Skip the Add-to-Cart click and open checkout directly (e.g. via "Buy Now").
// Useful for sites where Buy Now is the GoKwik trigger and ATC just adds.
export const SKIP_ATC =
  (process.env.SKIP_ATC ?? '').toLowerCase() === 'true';
