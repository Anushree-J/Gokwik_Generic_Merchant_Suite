# Generic Merchant Suite — GoKwik Checkout QA

End-to-end Playwright suite that validates the GoKwik checkout integration on **any merchant storefront**. One test, runtime-driven inputs, no merchant-specific code paths.

The flow walks a real browser through: storefront → product → add to cart → GoKwik checkout entry → phone → OTP → COD-button visibility. On top of that, an optional **BRD validation pass** asserts the merchant's configured brand colour, prepaid discount, payment methods, expected coupons, shipping, COD fees, tax display, analytics IDs, and COD limits.

**The flow intentionally stops at COD-button visibility — no order is placed.**

---

## Quick start

```bash
git clone -b anushree_J https://github.com/Anushree-J/Gokwik_Generic_Merchant_Suite.git
cd Gokwik_Generic_Merchant_Suite
npm install
npx playwright install chrome
./run.sh
```

`run.sh` is the interactive entry point. It prompts for the core flow inputs (URL / product / phone / discount / skip-ATC) plus the BRD inputs, then launches headed Chrome via Playwright.

---

## Run modes

`run.sh` opens with a mode prompt:

| Mode | Behavior |
|---|---|
| **1) BRD** | Every BRD prompt is **required** — must answer each one before the run starts. Use this when you have the full BRD spec for the merchant. |
| **2) Direct** (default) | Every BRD prompt is **optional** — press Enter to skip any. Use this for ad-hoc validation runs where you only care about a few fields. |

Both modes walk through the same questions; only enforcement differs. The test code is identical in both modes — every BRD `test.step()` skips silently when its env var is unset.

---

## Inputs reference

All inputs are env vars (set by `run.sh` or directly). Defaults are listed where present; otherwise the field is optional and skipped when blank.

### Core flow (required by `run.sh`)

| Env var | Description |
|---|---|
| `SITE_URL` | Merchant storefront URL (homepage or PDP) |
| `PRODUCT_NAME` | Product to search/click |
| `PHONE_NUMBER` | Mobile number for OTP login. Falls back to a random 10-digit number if unset. |
| `OTP_VALUE` | (optional, default `1212`) Sandbox OTP that every merchant accepts in test mode. |
| `DISCOUNT_CODE` | (optional) Coupon code to apply at checkout. When set, the test asserts the applied coupon discount is non-zero. |
| `SKIP_ATC` | `true` to skip Add-to-Cart and click Buy Now directly |
| `PLACE_ORDER` | (optional, default `false`) When `true`, the suite expects post-order analytics (Meta `Purchase`, GA4 `purchase`, the 2nd GAds conversion label). Leave unset for the stop-at-COD flow. |

### BRD §1 — Primary brand colour

| Env var | Description |
|---|---|
| `BRAND_COLOR_HEX` | 6-digit hex (with or without `#`). Asserted against the computed background-color of the primary action button inside the GoKwik iframe. |

### BRD §2 — Prepaid discount

| Env var | Description |
|---|---|
| `PREPAID_DISCOUNT_ENABLED` | `y` to validate this step |
| `PREPAID_DISCOUNT_SCOPE` | `all` (any prepaid method) or `upi` (UPI only) |
| `PREPAID_DISCOUNT_TYPE` | `flat` (₹) or `percent` (%) |
| `PREPAID_DISCOUNT_VALUE` | Number — rupees for flat, percent for percent |
| `PREPAID_DISCOUNT_CAP` | (optional) Max ₹ when type=percent |
| `PREPAID_DISCOUNT_MIN_CART` | (optional) Min cart total above which the discount applies |

### BRD §3 — Payment methods enabled

| Env var | Description |
|---|---|
| `PAYMENT_METHODS` | Comma-separated subset of `UPI,COD,PPCOD,Cards,Netbanking,Wallets,Snapmint,EMI`. Each must be visible in the checkout iframe. |

### BRD §4 — Discount list shown on checkout

| Env var | Description |
|---|---|
| `EXPECTED_DISCOUNT_CODES` | Comma-separated coupon codes the merchant expects to be visible in the GoKwik coupon drawer. |

### BRD §5 — Shipping

| Env var | Description |
|---|---|
| `SHIPPING_NAME` | Shipping line label (e.g. *Standard Delivery*) |
| `SHIPPING_PRICE` | Numeric price (₹) |

### BRD §6 — COD fees

| Env var | Description |
|---|---|
| `COD_FEE_ENABLED` | `y` to validate |
| `COD_FEE_VALUE` | Integer ₹ |

### BRD §8 — Tax setup

| Env var | Description |
|---|---|
| `TAX_SHOW_ON_CHECKOUT` | `y` to assert a tax/GST line is visible |
| `TAX_INCLUSIVE` | `y` to assert *"Inclusive of taxes"* text appears |

### BRD §9 / §10 / §11 — Analytics IDs

| Env var | Description |
|---|---|
| `GA4_MEASUREMENT_ID` | `G-XXXXXXX` — events must land on this property |
| `META_PIXEL_ID` | Numeric — events must land on this pixel |
| `GADS_ADWORDS_ID` | `AW-XXXXXXX` — conversions must land on this account |
| `GADS_PURCHASE_LABEL` | Conversion label for the purchase event (informational — not fired in stop-at-COD flow) |
| `GADS_BEGIN_CHECKOUT_LABEL` | Conversion label for begin_checkout — asserted present |

### BRD §12 — COD limit

| Env var | Description |
|---|---|
| `COD_LIMIT_LOWER` | Lower ₹ bound for COD eligibility |
| `COD_LIMIT_UPPER` | Upper ₹ bound for COD eligibility |

At runtime the suite reads the current cart total and asserts COD is visible iff `lower ≤ total ≤ upper`.

### BRD §7 — Pincode serviceability

**Not implemented.** Would need cart manipulation to test multiple pincodes.

---

## Project layout

```
.
├── run.sh                              # Interactive runner (mode prompt + BRD prompts)
├── playwright.config.ts                # Headed Chrome, 360s timeout, HTML+JUnit reporters
├── package.json                        # Deps: @playwright/test, dotenv
├── src/
│   ├── tests/
│   │   ├── Generic_FullCheckoutSuite.ts   # Single end-to-end test with all BRD steps
│   │   └── _inputs.ts                     # Env-driven input declarations
│   ├── pages/
│   │   ├── GenericMerchantPage.ts         # Storefront page object (navigate/search/ATC/PayNow)
│   │   └── GokwikCheckoutFrame.ts         # GoKwik iframe helpers
│   └── utils/
│       └── NetworkEventCapture.ts         # Meta/GA4/GAds request capture (with ID filtering)
└── report/                             # Playwright artifacts (gitignored)
```

---

## Running directly (CI / scripted)

`run.sh` is interactive. For CI or scripted runs, set the env vars and invoke Playwright directly:

```bash
SITE_URL='https://example.com/' \
PRODUCT_NAME='My Product' \
PHONE_NUMBER='9999999999' \
DISCOUNT_CODE='OFF10' \
PREPAID_DISCOUNT_ENABLED=y \
PREPAID_DISCOUNT_SCOPE=all \
PREPAID_DISCOUNT_TYPE=percent \
PREPAID_DISCOUNT_VALUE=5 \
PAYMENT_METHODS='UPI,COD,Cards' \
npx playwright test src/tests/Generic_FullCheckoutSuite.ts --headed
```

Reports land in `report/html/` (open with `npm run report`).

---

## Genericness — what stays merchant-agnostic

The page objects deliberately avoid merchant-specific classes, IDs, or text variants. When a new merchant breaks the suite, the fix should be **a generic improvement** that helps other merchants too — not a special case.

Past improvements made this way:
- `pay via` / `cash on delivery` added to the checkout-entry regex (heelium-style triggers, also seen on other GoKwik integrations)
- OTP popup-container fallback when the input is rendered inside a bottom-sheet
- Wider GoKwik iframe selector (`iframe[src*='gokwik']`) for merchants with custom iframe IDs
- 45-second iframe attach-wait for slow-init merchants
- `dismissPopups()` helper for cart-drawer / newsletter / age-gate overlays
- Bottom-sheet auto-close after discount apply so subsequent reads aren't blocked

Per-merchant exact-match locators are an anti-pattern in this repo.

---

## Known limitations

- Product matching depends on the merchant's homepage / search UX. If `PRODUCT_NAME` doesn't appear on the homepage, search falls back to common Shopify search patterns — but on bespoke storefronts (e.g. Magento), pass a direct PDP URL as `SITE_URL`.
- COD-limit validation (BRD §12) is a single-point check at the current cart value, not a sweep across multiple cart sizes.
- BRD §7 (pincode serviceability) is not implemented.
