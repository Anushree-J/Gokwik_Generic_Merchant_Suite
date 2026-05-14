// @ts-nocheck
import { Page, FrameLocator } from '@playwright/test';

// ---------------------------------------------------------------------------
// GokwikCheckoutFrame.ts
// Slim helper for the GoKwik checkout iframe — only the methods the suite
// uses (iframe switch, phone input, discount apply, summary reads). Each
// non-essential method is wrapped in a try/catch by the test, so this file
// stays small and tolerant of UI variations across merchants.
// ---------------------------------------------------------------------------

const log = (msg: string) => console.log(`[GokwikCheckoutFrame] ${msg}`);

const IFRAME_SELECTOR =
  "iframe#gokwik-iframe, iframe[title='Checkout window'], iframe[src*='gokwik']";

export class GokwikCheckoutFrame {
  readonly page: Page;
  private frame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
  }

  // --- iframe ---------------------------------------------------------------

  async verifyPresentOfIFrame(): Promise<boolean> {
    try {
      await this.page.locator(IFRAME_SELECTOR).waitFor({ state: 'visible', timeout: 45_000 });
      return true;
    } catch { return false; }
  }

  async switchToChekoutFrame(): Promise<boolean> {
    try {
      await this.page.locator(IFRAME_SELECTOR).waitFor({ state: 'visible', timeout: 45_000 });
      this.frame = this.page.frameLocator(IFRAME_SELECTOR);
      log('Switched to checkout iframe');
      return true;
    } catch (e) {
      log('Failed to switch to iframe: ' + e);
      return false;
    }
  }

  // --- phone / OTP ----------------------------------------------------------

  private phoneInput() {
    return this.frame.locator(
      "//input[@type='tel'] | " +
      "//input[@inputmode='tel'] | //input[@inputmode='numeric' and (@maxlength='10' or @maxlength='13')] | " +
      "//input[@id='phone-input'] | //input[@id='enterPhone'] | " +
      "//input[@name='phone'] | //input[@name='mobile'] | //input[@name='phoneNumber'] | " +
      "//input[contains(@class,'phone-input')] | " +
      "//input[contains(translate(@placeholder,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'mobile') or contains(translate(@placeholder,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'phone')] | " +
      "//input[contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'mobile') or contains(translate(@aria-label,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'phone')]"
    ).first();
  }

  async verifyPresentOfPhonenumber(): Promise<boolean> {
    try {
      await this.phoneInput().waitFor({ state: 'visible', timeout: 30_000 });
      return true;
    } catch { return false; }
  }

  async enterPhone(phone: string): Promise<boolean> {
    try {
      const input = this.phoneInput();
      await input.waitFor({ state: 'visible', timeout: 30_000 });
      await input.fill(phone);
      log(`Entered phone: ${phone}`);
      return true;
    } catch (e) {
      log('enterPhone failed: ' + e);
      return false;
    }
  }

  // --- OTP ------------------------------------------------------------------
  // GoKwik checkout uses either a single OTP input or N separate digit boxes.
  // Try the multi-box layout first, then fall back to a single input.
  async enterOtp(otp: string): Promise<boolean> {
    try {
      const digits = otp.split('');

      const boxes = this.frame.locator(
        "//input[@type='tel' and (@maxlength='1' or string-length(@maxlength)=0) and (contains(@class,'otp') or contains(@name,'otp') or contains(@id,'otp'))] | " +
        "//input[contains(@class,'otp-input')] | " +
        "//input[contains(@aria-label,'OTP') or contains(@aria-label,'otp')]"
      );
      const boxCount = await boxes.count().catch(() => 0);

      if (boxCount >= digits.length) {
        for (let i = 0; i < digits.length; i++) {
          const box = boxes.nth(i);
          await box.waitFor({ state: 'visible', timeout: 10_000 });
          await box.fill(digits[i]);
        }
        log(`Entered OTP across ${digits.length} boxes: ${otp}`);
        return true;
      }

      const single = this.frame.locator(
        "//input[@name='otp'] | //input[@id='otp'] | " +
        "//input[contains(@placeholder,'OTP') or contains(@placeholder,'otp')] | " +
        "//input[@inputmode='numeric' and (@maxlength='4' or @maxlength='6')]"
      ).first();
      try {
        await single.waitFor({ state: 'visible', timeout: 10_000 });
        await single.fill(otp);
        log(`Entered OTP in single input: ${otp}`);
        return true;
      } catch (_) { /* fall through to popup container fallback */ }

      // Fallback: some merchants render the OTP step in a popup container.
      // Look for input(s) inside the known popup XPath and fill them.
      const popupInputs = this.frame.locator(
        "xpath=/html/body/div/div/div[4]/div/div[2]/div/div//input"
      );
      const popupCount = await popupInputs.count().catch(() => 0);
      if (popupCount >= digits.length) {
        for (let i = 0; i < digits.length; i++) {
          const box = popupInputs.nth(i);
          await box.waitFor({ state: 'visible', timeout: 5_000 });
          await box.fill(digits[i]);
        }
        log(`Entered OTP in popup container across ${digits.length} boxes: ${otp}`);
        return true;
      }
      if (popupCount === 1) {
        const box = popupInputs.first();
        await box.waitFor({ state: 'visible', timeout: 5_000 });
        await box.fill(otp);
        log(`Entered OTP in popup container single input: ${otp}`);
        return true;
      }
      throw new Error('No OTP input found (multi-box, single, or popup container)');
    } catch (e) {
      log('enterOtp failed: ' + e);
      return false;
    }
  }

  // --- address (best-effort: returning users skip these) --------------------

  private async _fillFirst(selectors: string[], value: string): Promise<boolean> {
    for (const sel of selectors) {
      try {
        const loc = this.frame.locator(sel).first();
        if (await loc.isVisible({ timeout: 2_000 })) {
          await loc.fill(value);
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  async enterFullName(value: string): Promise<boolean> {
    return this._fillFirst([
      "//input[@name='full-name']",
      "//input[@id='full-name']",
      "//input[contains(@placeholder,'Name')]",
    ], value);
  }

  async enterFirstName(value: string): Promise<boolean> {
    return this._fillFirst([
      "//input[@name='first-name']", "//input[@id='first-name']",
    ], value);
  }

  async enterLastName(value: string): Promise<boolean> {
    return this._fillFirst([
      "//input[@name='last-name']", "//input[@id='last-name']",
    ], value);
  }

  async enterEmail(value: string): Promise<boolean> {
    return this._fillFirst([
      "//input[@name='email']", "//input[@id='email']",
      "//input[@type='email']",
    ], value);
  }

  async enterFullAddress(value: string): Promise<boolean> {
    return this._fillFirst([
      "//input[@name='full-address']", "//input[@id='full-address']",
      "//textarea[contains(@placeholder,'Address')]",
      "//input[contains(@placeholder,'Address')]",
    ], value);
  }

  // --- shipping / continue (best-effort no-ops if not present) --------------

  async selectCODShipMethod(): Promise<void> {
    try {
      const radio = this.frame.locator(
        "//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cash on delivery')]/ancestor::label | " +
        "//input[@type='radio' and contains(@value,'cod')]"
      ).first();
      if (await radio.isVisible({ timeout: 2_000 })) await radio.click();
    } catch (_) {}
  }

  async clickContinue(): Promise<void> {
    try {
      const btn = this.frame.locator(
        "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'continue')]"
      ).first();
      if (await btn.isVisible({ timeout: 2_000 })) await btn.click();
    } catch (_) {}
  }

  // --- discount apply -------------------------------------------------------

  async clickViewOffersUpdated(): Promise<void> {
    const candidates = [
      this.frame.locator("//button[contains(text(),'View all coupons')]").first(),
      this.frame.locator("//span[contains(text(),'View All')]").first(),
      this.frame.locator("//span[contains(text(),'View Coupons')]").first(),
      this.frame.locator("//*[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'view all')]").first(),
    ];
    for (const c of candidates) {
      try { if (await c.isVisible({ timeout: 2_000 })) { await c.click(); return; } }
      catch (_) {}
    }
  }

  async enterDiscountUpdated(code: string): Promise<void> {
    await this.page.waitForTimeout(2_000);
    const input = this.frame.locator(
      "//div[contains(@class,'container bottom')]//div[contains(@class,'discount-box')]//input | " +
      "//div[contains(@class,'discount-coupon')]//input | " +
      "//input[contains(@placeholder,'coupon') or contains(@placeholder,'Coupon')]"
    ).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill(code);
    await this.page.waitForTimeout(1_500);

    // 1. If a matching coupon suggestion tile is shown, clicking it applies directly.
    const suggestion = this.frame.locator(
      `//div[contains(@class,'coupon-name') and normalize-space(.)='${code}']`
    ).first();
    if (await suggestion.isVisible({ timeout: 2_000 }).catch(() => false)) {
      try { await suggestion.click({ timeout: 5_000 }); await this.page.waitForTimeout(2_000); return; } catch (_) {}
    }

    // 2. Apply button candidates, in priority order:
    //    a) The first button inside the GoKwik bottom-sheet container —
    //       generic across merchants. After apply, this same DOM path becomes
    //       the close/× affordance.
    //    b) Legacy text-based Apply locators for older GoKwik layouts.
    const apply = this.frame.locator(
      "xpath=//div[contains(@class,'bottom-sheet-container')]//button[1] | " +
      "//div[contains(@class,'container bottom')]//div[contains(@class,'discount-box')]//span[contains(text(),'Apply')] | " +
      "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]"
    ).first();
    try { await apply.click({ timeout: 5_000 }); }
    catch (_) {
      try { await apply.click({ force: true, timeout: 5_000 }); }
      catch (_2) { await input.press('Enter'); }
    }
    await this.page.waitForTimeout(2_000);

    // After applying, the GoKwik bottom-sheet stays open and blocks summary
    // reads + payment-method clicks. Close it generically.
    await this.closeBottomSheet();
  }

  // Close any GoKwik bottom-sheet drawer (discount drawer, payment list, etc.).
  // Targets the stable `.bottom-sheet-container` class and clicks its close
  // button. Falls back to Escape if no button is found.
  async closeBottomSheet(): Promise<void> {
    const closeButton = this.frame.locator(
      "xpath=//div[contains(@class,'bottom-sheet-container')]//button[1]"
    ).first();
    try {
      if (await closeButton.isVisible({ timeout: 2_000 })) {
        await closeButton.click({ timeout: 3_000 });
        log('Closed bottom-sheet via close button');
        await this.page.waitForTimeout(500);
        return;
      }
    } catch (_) { /* fall through */ }
    try {
      await this.page.keyboard.press('Escape');
      log('Closed bottom-sheet via Escape');
    } catch (_) {}
  }

  // --- summary reads --------------------------------------------------------

  private async _firstText(selectors: string[]): Promise<string> {
    for (const sel of selectors) {
      try {
        const loc = this.frame.locator(sel).first();
        if (await loc.isVisible({ timeout: 2_000 })) {
          return ((await loc.textContent()) ?? '').trim();
        }
      } catch (_) {}
    }
    return '';
  }

  async youSaved(): Promise<string> {
    return this._firstText([
      "//*[contains(text(),'You saved')]/following-sibling::*[1]",
      "//*[contains(text(),'You Saved')]/following-sibling::*[1]",
      "//*[contains(text(),'saved')]/parent::*//span[2]",
    ]);
  }

  async couponDiscount(): Promise<string> {
    return this._firstText([
      "//*[text()='Coupon Discount']/..//span[2]",
      "//*[contains(text(),'Coupon Discount')]/following-sibling::*[1]",
      "//*[contains(text(),'Coupon')]/parent::*//span[2]",
    ]);
  }

  async calculateToPayWithPreCouponDiscount(): Promise<void> { /* noop */ }
  async calculateToPayWithAppliedCoupon(): Promise<void>     { /* noop */ }

  // --- BRD validation helpers ------------------------------------------------
  // All helpers are best-effort: they return null/empty/false rather than
  // throwing, so calling tests can decide how strict to be.

  // Read the amount on a summary line whose label matches `labelRegex`.
  // Tries adjacent-sibling, parent/child, and same-row patterns.
  async summaryLineAmount(labelRegex: RegExp): Promise<number | null> {
    const reSrc = labelRegex.source;
    const flags = labelRegex.flags.includes('i') ? labelRegex.flags : labelRegex.flags + 'i';
    const re = new RegExp(reSrc, flags);
    const labelXpath = `//*[self::span or self::div or self::p or self::label][string-length(normalize-space(.)) < 80][not(*)]`;
    const labels = this.frame.locator(`xpath=${labelXpath}`);
    const count = await labels.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 300); i++) {
      const txt = ((await labels.nth(i).textContent().catch(() => '')) ?? '').trim();
      if (!re.test(txt)) continue;
      const handle = labels.nth(i);
      const sibling = handle.locator('xpath=following-sibling::*[1]');
      const parentSpan = handle.locator('xpath=../*[contains(., "₹")][last()]');
      for (const cand of [sibling, parentSpan]) {
        const s = ((await cand.textContent().catch(() => '')) ?? '').trim();
        const amt = this._parseAmount(s);
        if (amt > 0 || /^0+(\.0+)?$/.test(s.replace(/[^0-9.]/g, ''))) return amt;
      }
    }
    return null;
  }

  // Returns true if any element inside the iframe carries the given text
  // (case-insensitive, whitespace-tolerant). Used for tax/shipping/payment-
  // method presence checks where the merchant's exact markup is unknown.
  async hasTextInFrame(needle: string): Promise<boolean> {
    if (!needle) return false;
    const safe = needle.replace(/'/g, "\\'");
    try {
      return await this.frame.locator(
        `xpath=//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${safe.toLowerCase()}")]`
      ).first().isVisible({ timeout: 2_000 });
    } catch { return false; }
  }

  // BRD §3 — Check if a named payment method is visible in the iframe.
  // Maps short names to the variations merchants commonly render.
  async isPaymentMethodVisible(method: string): Promise<boolean> {
    const m = method.trim().toLowerCase();
    const synonyms: Record<string, string[]> = {
      upi:        ['upi', 'pay via upi', 'gpay', 'phonepe', 'paytm upi'],
      cod:        ['cash on delivery', 'cod'],
      ppcod:      ['ppcod', 'partial cod', 'prepaid cod', 'pay & confirm'],
      cards:      ['credit/debit card', 'credit card', 'debit card', 'cards'],
      netbanking: ['netbanking', 'net banking', 'internet banking'],
      wallets:    ['wallet', 'mobikwik', 'amazon pay'],
      snapmint:   ['snapmint', 'pay in 3', 'emi via snapmint'],
      emi:        ['emi on', 'emi via', 'no-cost emi', 'no cost emi', 'emi'],
    };
    const needles = synonyms[m] ?? [m];
    for (const n of needles) {
      if (await this.hasTextInFrame(n)) return true;
    }
    return false;
  }

  // BRD §3 — Click a payment method tile so we can read post-selection state
  // (prepaid discount, COD fee, etc.). Best-effort: returns true on click.
  async selectPaymentMethod(method: string): Promise<boolean> {
    const m = method.trim().toLowerCase();
    const synonyms: Record<string, string[]> = {
      upi:        ['upi'],
      cod:        ['cash on delivery', 'cod'],
      cards:      ['credit/debit card', 'cards'],
      netbanking: ['netbanking', 'net banking'],
      wallets:    ['wallet'],
      snapmint:   ['snapmint'],
      emi:        ['emi'],
    };
    const needles = synonyms[m] ?? [m];
    for (const n of needles) {
      const safe = n.replace(/'/g, "\\'");
      const loc = this.frame.locator(
        `xpath=//*[self::button or self::label or self::div or self::span][` +
        `contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${safe.toLowerCase()}")]`
      ).first();
      try {
        if (await loc.isVisible({ timeout: 2_000 })) {
          await loc.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});
          await loc.click({ timeout: 3_000 });
          await this.page.waitForTimeout(1_500);
          return true;
        }
      } catch (_) { /* try next */ }
    }
    return false;
  }

  // BRD §4 — Open the coupons drawer and read every code listed.
  async listedCouponCodes(): Promise<string[]> {
    try { await this.clickViewOffersUpdated(); } catch (_) {}
    await this.page.waitForTimeout(1_500);
    const out = new Set<string>();
    const tiles = this.frame.locator(
      "xpath=//*[contains(@class, 'coupon-name') or contains(@class, 'coupon-code') or contains(@class, 'offer-code')]"
    );
    const n = await tiles.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 50); i++) {
      const t = ((await tiles.nth(i).textContent().catch(() => '')) ?? '').trim();
      if (t) out.add(t);
    }
    return [...out];
  }

  // BRD §1 — Read the computed background-colour of the primary action button
  // inside the iframe. Returns "#rrggbb" or null. We try a few candidates
  // because merchants theme different buttons.
  async primaryButtonHex(): Promise<string | null> {
    const candidates = [
      this.frame.locator("xpath=//button[contains(@class,'primary') or contains(@class,'cta')]").first(),
      this.frame.locator("xpath=//button[contains(@class,'btn-cod')]").first(),
      this.frame.locator("xpath=//button[contains(@class,'pay') or contains(@class,'continue')]").first(),
      this.frame.locator('button').first(),
    ];
    for (const c of candidates) {
      try {
        const rgb = await c.evaluate((el: HTMLElement) =>
          window.getComputedStyle(el).backgroundColor
        );
        const hex = this._rgbToHex(rgb);
        if (hex) return hex;
      } catch (_) { /* try next */ }
    }
    return null;
  }

  private _rgbToHex(rgb: string): string | null {
    const m = rgb.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`.toLowerCase();
  }

  private _parseAmount(raw: string): number {
    if (!raw) return 0;
    const idx = raw.indexOf('₹');
    const slice = idx >= 0 ? raw.substring(idx + 1) : raw;
    return parseFloat(slice.replace(/,/g, '').trim()) || 0;
  }
}

export default GokwikCheckoutFrame;
