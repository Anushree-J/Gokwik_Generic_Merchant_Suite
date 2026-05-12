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
  "iframe#gokwik-iframe, iframe[title='Checkout window']";

export class GokwikCheckoutFrame {
  readonly page: Page;
  private frame!: FrameLocator;

  constructor(page: Page) {
    this.page = page;
  }

  // --- iframe ---------------------------------------------------------------

  async verifyPresentOfIFrame(): Promise<boolean> {
    try {
      await this.page.locator(IFRAME_SELECTOR).waitFor({ state: 'visible', timeout: 15_000 });
      return true;
    } catch { return false; }
  }

  async switchToChekoutFrame(): Promise<boolean> {
    try {
      await this.page.locator(IFRAME_SELECTOR).waitFor({ state: 'visible', timeout: 15_000 });
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

    // 2. Fall back to the Apply button. The bottom-sheet backdrop sometimes
    // intercepts pointer events during animation — force-click bypasses that.
    const apply = this.frame.locator(
      "//div[contains(@class,'container bottom')]//div[contains(@class,'discount-box')]//span[contains(text(),'Apply')] | " +
      "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'apply')]"
    ).first();
    try { await apply.click({ timeout: 5_000 }); }
    catch (_) {
      try { await apply.click({ force: true, timeout: 5_000 }); }
      catch (_2) { await input.press('Enter'); }
    }
    await this.page.waitForTimeout(2_000);
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
}

export default GokwikCheckoutFrame;
