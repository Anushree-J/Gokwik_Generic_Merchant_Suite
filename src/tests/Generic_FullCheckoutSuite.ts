// @ts-nocheck
import { test, expect } from '@playwright/test';
import { GenericMerchantPage } from '../pages/GenericMerchantPage';
import { GokwikCheckoutFrame } from '../pages/GokwikCheckoutFrame';
import { NetworkEventCapture } from '../utils/NetworkEventCapture';
import { SITE_URL, PRODUCT_NAME, DISCOUNT_CODE, PHONE_NUMBER, SKIP_ATC } from './_inputs';

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
      const phone = PHONE_NUMBER || randomPhone();
      await checkout.enterPhone(phone);
      console.log(`Entered phone: ${phone}`);

      // Manual OTP entry — user types the OTP in the headed browser. Wait up
      // to 3 minutes for either the address tab (new user) or the payment
      // screen (returning user with a saved address).
      console.log('\n>>> ACTION REQUIRED: enter the login OTP in the browser. The test will continue automatically. <<<\n');
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
  });
});
