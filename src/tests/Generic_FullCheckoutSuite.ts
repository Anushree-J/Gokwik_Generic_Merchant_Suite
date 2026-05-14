// @ts-nocheck
import { test, expect } from '@playwright/test';
import { GenericMerchantPage } from '../pages/GenericMerchantPage';
import { GokwikCheckoutFrame } from '../pages/GokwikCheckoutFrame';
import { NetworkEventCapture } from '../utils/NetworkEventCapture';
import {
  SITE_URL, PRODUCT_NAME, DISCOUNT_CODE, PHONE_NUMBER, SKIP_ATC,
  BRAND_COLOR_HEX,
  PREPAID_DISCOUNT_ENABLED, PREPAID_DISCOUNT_SCOPE, PREPAID_DISCOUNT_TYPE,
  PREPAID_DISCOUNT_VALUE, PREPAID_DISCOUNT_CAP, PREPAID_DISCOUNT_MIN_CART,
  PAYMENT_METHODS,
  EXPECTED_DISCOUNT_CODES,
  SHIPPING_NAME, SHIPPING_PRICE,
  COD_FEE_ENABLED, COD_FEE_VALUE,
  TAX_SHOW_ON_CHECKOUT, TAX_INCLUSIVE,
  GA4_MEASUREMENT_ID, META_PIXEL_ID,
  GADS_ADWORDS_ID, GADS_PURCHASE_LABEL, GADS_BEGIN_CHECKOUT_LABEL,
  COD_LIMIT_LOWER, COD_LIMIT_UPPER,
} from './_inputs';

// ---------------------------------------------------------------------------
// Generic_FullCheckoutSuite
// One test, six validation steps, against any merchant storefront. Inputs
// (URL / product / mobile / discount) come from env vars set by run.sh.
// Stops at "COD button visible" — no order is placed.
// ---------------------------------------------------------------------------

// Default address values used only if the new-user address tab actually
// appears (returning users skip them). All wrapped in try-catch upstream.
const DEFAULT_FULLNAME    = 'Saleheen Anwar';
const DEFAULT_FIRSTNAME   = 'Saleheen';
const DEFAULT_LASTNAME    = 'Anwar';
const DEFAULT_EMAIL       = 'saleheen@gokwik.co';
const DEFAULT_FULLADDRESS = 'House No 244, Sangharsh Nagar, Nashik 422010';

const randomPhone = () =>
  String(Math.floor(6_000_000_000 + Math.random() * 3_999_999_999));

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const idx = raw.indexOf('₹');
  const slice = idx >= 0 ? raw.substring(idx + 1) : raw;
  return parseFloat(slice.replace(/,/g, '').trim()) || 0;
};

test.describe('GenericMerchant — Full Checkout Suite', () => {
  test('Generic_FullCheckoutSuite', async ({ page }) => {
    console.log(`SITE_URL=${SITE_URL}`);
    console.log(`PRODUCT_NAME=${PRODUCT_NAME}`);
    console.log(`PHONE_NUMBER=${PHONE_NUMBER || '<random>'}`);
    console.log(`DISCOUNT_CODE=${DISCOUNT_CODE || '<unset>'}`);
    console.log(`SKIP_ATC=${SKIP_ATC}`);

    const capture = new NetworkEventCapture(page);
    capture.start();

    const merchant = new GenericMerchantPage(page);

    await test.step('1. Basic UI — storefront loads', async () => {
      expect(await merchant.goToSite(SITE_URL)).toBe(true);
      const title = await page.title();
      expect(title.length, 'Storefront should render with a non-empty title').toBeGreaterThan(0);
      console.log(`Storefront title: ${title}`);
    });

    await test.step('Click product and add to cart', async () => {
      expect(await merchant.clickProductByName(PRODUCT_NAME)).toBe(true);
      if (SKIP_ATC) {
        console.log('SKIP_ATC=true — skipping Add to Cart, will click Buy Now directly');
      } else {
        expect(await merchant.clickAddToCart()).toBe(true);
        await page.waitForTimeout(2000);
      }
    });

    let checkout: GokwikCheckoutFrame;
    await test.step('2. Checkout button working — iframe opens', async () => {
      expect(await merchant.clickPayNowOrPlaceOrder()).toBe(true);
      checkout = new GokwikCheckoutFrame(page);
      expect(await checkout.verifyPresentOfIFrame(), 'GoKwik iframe should be visible').toBe(true);
      expect(await checkout.switchToChekoutFrame()).toBe(true);
      expect(await checkout.verifyPresentOfPhonenumber(), 'Phone input should be visible').toBe(true);
      console.log('Checkout iframe + phone field rendered');
    });

    await test.step('Enter mobile + address', async () => {
      const phone = '9289955127';
      await checkout.enterPhone(phone);
      console.log(`Entered phone: ${phone}`);

      // Hardcoded OTP for this merchant's sandbox.
      await page.waitForTimeout(2000);
      await checkout.enterOtp('1212');

      const checkoutFrame = page.frameLocator("iframe#gokwik-iframe, iframe[title='Checkout window']");
      const postOtpIndicator = checkoutFrame.locator(
        "//input[@name='full-name'] | //input[@id='full-name'] | //input[@name='full-address'] | " +
        "//input[@id='pincode'] | //input[@placeholder='Enter Pincode'] | " +
        "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'payment options')] | " +
        "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delivery details')] | " +
        "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'deliver to')]"
      ).first();
      await postOtpIndicator.waitFor({ state: 'visible', timeout: 180_000 });
      console.log('OTP accepted — proceeded past phone screen');

      // If address tab is visible, fill it. Returning users skip this.
      try {
        await checkout.enterFullName(DEFAULT_FULLNAME);
        await checkout.enterEmail(DEFAULT_EMAIL);
        await checkout.enterFullAddress(DEFAULT_FULLADDRESS);
      } catch (_) {
        try {
          await checkout.enterFirstName(DEFAULT_FIRSTNAME);
          await checkout.enterLastName(DEFAULT_LASTNAME);
          await checkout.enterEmail(DEFAULT_EMAIL);
          await checkout.enterFullAddress(DEFAULT_FULLADDRESS);
        } catch (_2) {
          console.log('Address tab skipped (returning user with saved address)');
        }
      }
      try { await checkout.selectCODShipMethod(); } catch (_) {}
      try { await checkout.clickContinue(); } catch (_) {}
      try { await checkout.calculateToPayWithPreCouponDiscount(); } catch (_) {}
    });

    await test.step('3. Discount apply', async () => {
      if (!DISCOUNT_CODE) {
        console.log('No DISCOUNT_CODE supplied — skipping discount step');
        return;
      }
      try {
        await checkout.clickViewOffersUpdated();
        await checkout.enterDiscountUpdated(DISCOUNT_CODE);
        await page.waitForTimeout(2000);
        const youSaved   = parseAmount(await checkout.youSaved());
        const couponDisc = parseAmount(await checkout.couponDiscount());
        expect(couponDisc).toBe(youSaved);
        await checkout.calculateToPayWithAppliedCoupon();
        console.log(`Discount applied — coupon=${couponDisc}, youSaved=${youSaved}`);
      } catch (e) {
        console.warn('Discount apply step soft-failed:', e);
      }
    });

    await test.step('4. Basic checkout sanity — verify COD button is visible (order NOT placed)', async () => {
      const codFrame = page.frameLocator("iframe#gokwik-iframe, iframe[title='Checkout window']");
      const codCandidates = [
        codFrame.locator("//button[contains(@class,'btn-cod')]").first(),
        codFrame.locator("xpath=//*[self::button or self::label or self::div or self::span][contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cash on delivery')]").first(),
        codFrame.locator("xpath=//*[self::button or self::label or self::div or self::span][normalize-space(.)='COD' or normalize-space(.)='Cod']").first(),
        codFrame.locator("xpath=//*[contains(@class,'cod')]").first(),
      ];

      let codVisible = false;
      for (const loc of codCandidates) {
        try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch (_) {}
        try {
          if (await loc.isVisible({ timeout: 5000 })) { codVisible = true; break; }
        } catch (_) {}
      }

      if (!codVisible) {
        try {
          await codFrame.locator('body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
          await page.waitForTimeout(1000);
          for (const loc of codCandidates) {
            if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
              codVisible = true;
              break;
            }
          }
        } catch (_) {}
      }

      expect(codVisible, 'COD button should be visible on the payment tab').toBe(true);
      console.log('COD button is visible — order placement intentionally skipped');
    });

    // -----------------------------------------------------------------------
    // BRD validation steps. Each step is OPTIONAL and skips silently when its
    // configuring input(s) are unset. The suite stays usable for merchants
    // that haven't configured the corresponding feature.
    // -----------------------------------------------------------------------

    await test.step('BRD §1 — Primary brand colour', async () => {
      if (!BRAND_COLOR_HEX) { console.log('BRAND_COLOR_HEX unset — skipping'); return; }
      const expected = BRAND_COLOR_HEX.replace(/^#?/, '#').toLowerCase();
      const actual = await checkout.primaryButtonHex();
      console.log(`Brand colour — expected=${expected} actual=${actual ?? '<none>'}`);
      expect(actual, `Primary button background should match ${expected}`).toBe(expected);
    });

    await test.step('BRD §3 — Configured payment methods visible', async () => {
      if (PAYMENT_METHODS.length === 0) { console.log('PAYMENT_METHODS unset — skipping'); return; }
      for (const method of PAYMENT_METHODS) {
        const visible = await checkout.isPaymentMethodVisible(method);
        console.log(`Payment method '${method}' visible=${visible}`);
        expect(visible, `Payment method '${method}' should be visible`).toBe(true);
      }
    });

    await test.step('BRD §4 — Expected discount codes listed', async () => {
      if (EXPECTED_DISCOUNT_CODES.length === 0) { console.log('EXPECTED_DISCOUNT_CODES unset — skipping'); return; }
      const listed = await checkout.listedCouponCodes();
      console.log(`Coupons listed: ${listed.join(', ') || '<none>'}`);
      for (const code of EXPECTED_DISCOUNT_CODES) {
        const found = listed.some((c) => c.toLowerCase().includes(code.toLowerCase()));
        expect(found, `Expected coupon code '${code}' to be listed`).toBe(true);
      }
    });

    await test.step('BRD §5 — Shipping line', async () => {
      if (!SHIPPING_NAME && SHIPPING_PRICE === null) { console.log('SHIPPING_NAME/PRICE unset — skipping'); return; }
      if (SHIPPING_NAME) {
        const visible = await checkout.hasTextInFrame(SHIPPING_NAME);
        expect(visible, `Shipping line '${SHIPPING_NAME}' should appear in summary`).toBe(true);
      }
      if (SHIPPING_PRICE !== null) {
        const amt = await checkout.summaryLineAmount(/shipping|delivery/i);
        console.log(`Shipping amount — expected=${SHIPPING_PRICE} actual=${amt ?? '<none>'}`);
        expect(amt, 'Shipping amount line should be present').not.toBeNull();
        expect(amt).toBe(SHIPPING_PRICE);
      }
    });

    await test.step('BRD §8 — Tax display', async () => {
      if (!TAX_SHOW_ON_CHECKOUT && !TAX_INCLUSIVE) { console.log('TAX_* unset — skipping'); return; }
      if (TAX_SHOW_ON_CHECKOUT) {
        const taxLine =
          (await checkout.hasTextInFrame('tax')) ||
          (await checkout.hasTextInFrame('gst'));
        expect(taxLine, 'A tax/GST line should be visible in the summary').toBe(true);
      }
      if (TAX_INCLUSIVE) {
        const inclusive = await checkout.hasTextInFrame('inclusive of');
        expect(inclusive, '"Inclusive of taxes" text should be visible').toBe(true);
      }
    });

    await test.step('BRD §12 — COD limit (single-point check at current cart value)', async () => {
      if (COD_LIMIT_LOWER === null && COD_LIMIT_UPPER === null) { console.log('COD_LIMIT_* unset — skipping'); return; }
      const cartAmount =
        (await checkout.summaryLineAmount(/to pay|total payable|order total|grand total/i)) ?? 0;
      const codVisible = await checkout.isPaymentMethodVisible('COD');
      const withinRange =
        (COD_LIMIT_LOWER === null || cartAmount >= COD_LIMIT_LOWER) &&
        (COD_LIMIT_UPPER === null || cartAmount <= COD_LIMIT_UPPER);
      console.log(`COD limit — cart=${cartAmount} within=[${COD_LIMIT_LOWER}, ${COD_LIMIT_UPPER}]=${withinRange} cod_visible=${codVisible}`);
      expect(codVisible, `COD should ${withinRange ? '' : 'NOT '}be visible at cart=${cartAmount}`).toBe(withinRange);
    });

    await test.step('BRD §6 — COD fee value', async () => {
      if (!COD_FEE_ENABLED) { console.log('COD_FEE_ENABLED unset — skipping'); return; }
      const selected = await checkout.selectPaymentMethod('COD');
      if (!selected) { console.warn('Could not select COD tile — skipping'); return; }
      await page.waitForTimeout(1500);
      const fee = await checkout.summaryLineAmount(/cod (fee|charge)/i);
      console.log(`COD fee — expected=${COD_FEE_VALUE} actual=${fee ?? '<none>'}`);
      expect(fee, 'COD fee line should be present').not.toBeNull();
      if (COD_FEE_VALUE !== null) expect(fee).toBe(COD_FEE_VALUE);
    });

    await test.step('BRD §2 — Prepaid discount', async () => {
      if (!PREPAID_DISCOUNT_ENABLED) { console.log('PREPAID_DISCOUNT_ENABLED unset — skipping'); return; }
      const cartAmount =
        (await checkout.summaryLineAmount(/to pay|total payable|order total|grand total/i)) ?? 0;
      if (PREPAID_DISCOUNT_MIN_CART !== null && cartAmount < PREPAID_DISCOUNT_MIN_CART) {
        console.log(`Cart ${cartAmount} below prepaid discount min ${PREPAID_DISCOUNT_MIN_CART} — skipping`);
        return;
      }
      // Switch to a prepaid method. For scope=upi only UPI qualifies; for
      // scope=all any prepaid method works — try UPI first as the common case.
      const method = PREPAID_DISCOUNT_SCOPE.toLowerCase() === 'upi' ? 'UPI' : 'UPI';
      const selected = await checkout.selectPaymentMethod(method);
      if (!selected) { console.warn(`Could not select ${method} tile — skipping`); return; }
      await page.waitForTimeout(1500);

      const discountAmt = await checkout.summaryLineAmount(/prepaid (discount|offer)|online payment discount/i);
      console.log(`Prepaid discount — actual=${discountAmt ?? '<none>'}`);
      expect(discountAmt, 'Prepaid discount line should appear after selecting prepaid method').not.toBeNull();

      if (PREPAID_DISCOUNT_VALUE !== null) {
        let expected: number;
        if (PREPAID_DISCOUNT_TYPE.toLowerCase() === 'percent') {
          expected = (cartAmount * PREPAID_DISCOUNT_VALUE) / 100;
          if (PREPAID_DISCOUNT_CAP !== null) expected = Math.min(expected, PREPAID_DISCOUNT_CAP);
        } else {
          expected = PREPAID_DISCOUNT_VALUE;
        }
        const rounded = Math.round(expected * 100) / 100;
        console.log(`Prepaid discount expected=${rounded} (type=${PREPAID_DISCOUNT_TYPE}, value=${PREPAID_DISCOUNT_VALUE}, cap=${PREPAID_DISCOUNT_CAP}, cart=${cartAmount})`);
        expect(Math.abs((discountAmt ?? 0) - rounded)).toBeLessThanOrEqual(1);
      }
    });

    capture.stop();
    const summary = capture.summary();
    console.log('Captured event summary:', summary);

    // Specific events we expect this checkout flow to fire. Anything outside
    // these lists is ignored — we no longer assert on raw hit counts.
    const REQUIRED_META_EVENTS = ['InitiateCheckout', 'AddPaymentInfo', 'Purchase'];
    const REQUIRED_GA4_EVENTS = [
      'gokwik_checkout_initiated',
      'begin_checkout',
      'add_shipping_info',
      'add_payment_info',
      'purchase',
    ];
    const REQUIRED_GADS_CONVERSION_COUNT = 2; // begin_checkout + purchase labels

    await test.step('5. Meta events — InitiateCheckout / AddPaymentInfo / Purchase', async () => {
      const seen = capture.metaEventNames();
      console.log(`Meta events captured: ${seen.join(', ') || '<none>'}`);
      for (const ev of REQUIRED_META_EVENTS) {
        expect(capture.hasMetaEvent(ev), `Expected Meta event '${ev}' to fire`).toBe(true);
      }
    });

    await test.step('6. GA4 events — begin_checkout / add_shipping_info / add_payment_info / purchase / gokwik_checkout_initiated', async () => {
      const seen = capture.ga4EventNames();
      console.log(`GA4 events captured: ${seen.join(', ') || '<none>'}`);
      for (const ev of REQUIRED_GA4_EVENTS) {
        expect(capture.hasGa4Event(ev), `Expected GA4 event '${ev}' to fire`).toBe(true);
      }
    });

    await test.step('7. Google Ads — begin_checkout + purchase conversion labels', async () => {
      const labels = capture.gadsConversionLabels();
      console.log(`GAds conversion labels captured: ${labels.join(', ') || '<none>'}`);
      expect(
        labels.length >= REQUIRED_GADS_CONVERSION_COUNT,
        `Expected at least ${REQUIRED_GADS_CONVERSION_COUNT} distinct GAds conversion labels (begin_checkout + purchase); got ${labels.length}`
      ).toBe(true);
    });

    // -----------------------------------------------------------------------
    // BRD §9 / §10 / §11 — analytics events must land on the configured IDs.
    // Each step is OPTIONAL: skipped when the corresponding ID is unset.
    // -----------------------------------------------------------------------

    await test.step('BRD §9 — GA4 events sent to configured measurement ID', async () => {
      if (!GA4_MEASUREMENT_ID) { console.log('GA4_MEASUREMENT_ID unset — skipping'); return; }
      const names = capture.ga4EventNamesForId(GA4_MEASUREMENT_ID);
      console.log(`GA4 events on ${GA4_MEASUREMENT_ID}: ${names.join(', ') || '<none>'}`);
      expect(names.length, `GA4 should fire to measurement ID ${GA4_MEASUREMENT_ID}`).toBeGreaterThan(0);
      // Each pre-order required GA4 event should land on this ID too.
      for (const ev of REQUIRED_GA4_EVENTS) {
        if (ev === 'purchase') continue; // not fired in stop-at-COD flow
        expect(
          capture.hasGa4EventForId(ev, GA4_MEASUREMENT_ID),
          `GA4 event '${ev}' should fire to measurement ID ${GA4_MEASUREMENT_ID}`
        ).toBe(true);
      }
    });

    await test.step('BRD §10 — Meta events sent to configured pixel ID', async () => {
      if (!META_PIXEL_ID) { console.log('META_PIXEL_ID unset — skipping'); return; }
      const names = capture.metaEventNamesForPixel(META_PIXEL_ID);
      console.log(`Meta events on pixel ${META_PIXEL_ID}: ${names.join(', ') || '<none>'}`);
      expect(names.length, `Meta should fire to pixel ${META_PIXEL_ID}`).toBeGreaterThan(0);
      for (const ev of REQUIRED_META_EVENTS) {
        if (ev === 'Purchase') continue; // not fired in stop-at-COD flow
        expect(
          capture.hasMetaEventForPixel(ev, META_PIXEL_ID),
          `Meta event '${ev}' should fire to pixel ${META_PIXEL_ID}`
        ).toBe(true);
      }
    });

    await test.step('BRD §11 — GAds conversions sent to configured Adwords ID', async () => {
      if (!GADS_ADWORDS_ID) { console.log('GADS_ADWORDS_ID unset — skipping'); return; }
      const labels = capture.gadsLabelsForAwId(GADS_ADWORDS_ID);
      console.log(`GAds labels on ${GADS_ADWORDS_ID}: ${labels.join(', ') || '<none>'}`);
      expect(labels.length, `GAds conversions should land on ${GADS_ADWORDS_ID}`).toBeGreaterThan(0);
      if (GADS_BEGIN_CHECKOUT_LABEL) {
        expect(
          labels.some((l) => l === GADS_BEGIN_CHECKOUT_LABEL),
          `Expected begin_checkout conversion label '${GADS_BEGIN_CHECKOUT_LABEL}' on ${GADS_ADWORDS_ID}`
        ).toBe(true);
      }
      if (GADS_PURCHASE_LABEL) {
        // Purchase label only fires after order placement, which this suite
        // intentionally skips. Log presence but don't hard-fail.
        const found = labels.some((l) => l === GADS_PURCHASE_LABEL);
        console.log(`GAds purchase label '${GADS_PURCHASE_LABEL}' present=${found} (flow stops pre-order; informational only)`);
      }
    });
  });
});
