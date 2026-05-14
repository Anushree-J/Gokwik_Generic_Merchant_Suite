// @ts-nocheck
import { Page, Locator } from '@playwright/test';

// ---------------------------------------------------------------------------
// GenericMerchantPage.ts
// Drives a merchant storefront whose URL and product name are supplied as
// inputs at runtime. The page object stays generic so the same flow can run
// across multiple sites without site-specific locators.
//
// Flow:
//   1. goToSite(url)
//   2. clickProductByName(productName)  → opens PDP (no-op if URL is a PDP)
//   3. clickAddToCart()                  → adds product
//   4. clickPayNowOrPlaceOrder()         → opens GoKwik checkout iframe
// ---------------------------------------------------------------------------

const log = (msg: string) => console.log(`[GenericMerchantPage] ${msg}`);

export class GenericMerchantPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goToSite(url: string): Promise<boolean> {
    try {
      const target = url.startsWith('http') ? url : `https://${url}`;
      log(`Navigating to site: ${target}`);
      await this.page.goto(target, { waitUntil: 'domcontentloaded' });
      await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      return true;
    } catch (e) {
      log('Failed to open site URL: ' + e);
      return false;
    }
  }

  async clickProductByName(productName: string): Promise<boolean> {
    const name = productName.trim();

    // If SITE_URL already pointed at a PDP, we're done.
    const currentUrl = this.page.url();
    if (/\/products?\//i.test(currentUrl)) {
      log(`Already on a PDP (${currentUrl}) — skipping product click`);
      return true;
    }

    log(`Clicking product by name: ${name}`);

    const directCandidates: Locator[] = [
      this.page.locator(`a:has-text("${name}")`).first(),
      this.page.locator(`xpath=//a[normalize-space(.)="${name}"]`).first(),
      this.page.locator(`xpath=//*[self::h1 or self::h2 or self::h3 or self::span or self::div][normalize-space(.)="${name}"]/ancestor::a[1]`).first(),
    ];

    for (const loc of directCandidates) {
      try {
        if (await loc.isVisible({ timeout: 4000 })) {
          await loc.scrollIntoViewIfNeeded();
          await loc.click();
          await this.page.waitForLoadState('domcontentloaded').catch(() => {});
          log(`Clicked product: ${name}`);
          return true;
        }
      } catch (_) { /* try next */ }
    }

    if (await this.searchAndOpenProduct(name)) return true;

    log(`Could not find/click product: ${name}`);
    return false;
  }

  private async searchAndOpenProduct(productName: string): Promise<boolean> {
    const searchToggleCandidates: Locator[] = [
      this.page.locator('xpath=//button[contains(@aria-label,"Search") or contains(@class,"search-toggle") or contains(@class,"search-button")]').first(),
      this.page.locator('a[href*="/search"]').first(),
    ];

    for (const t of searchToggleCandidates) {
      try {
        if (await t.isVisible({ timeout: 1500 })) {
          await t.click();
          break;
        }
      } catch (_) {}
    }

    const searchInputs: Locator[] = [
      this.page.locator('input[type="search"]').first(),
      this.page.locator('input[name="q"]').first(),
      this.page.locator('xpath=//input[contains(@placeholder,"Search") or contains(@aria-label,"Search")]').first(),
    ];

    for (const input of searchInputs) {
      try {
        if (await input.isVisible({ timeout: 1500 })) {
          await input.fill(productName);
          await this.page.waitForTimeout(1500);
          await input.press('Enter').catch(() => {});
          await this.page.waitForTimeout(2000);

          const result = this.page.locator(`a:has-text("${productName}")`).first();
          if (await result.isVisible({ timeout: 4000 })) {
            await result.click();
            await this.page.waitForLoadState('domcontentloaded').catch(() => {});
            return true;
          }
        }
      } catch (_) {}
    }
    return false;
  }

  // Dismiss any newsletter / cart-drawer / age-gate / cookie-consent modal
  // that might overlay the next interactive button. Generic across merchants:
  // tries Escape first (closes most accessible dialogs), then explicit close
  // affordances (× glyph, aria-label, "No thanks", etc.), then any dialog's
  // close button as a last resort.
  async dismissPopups(): Promise<void> {
    // Pass 1: Escape — most accessible dialogs close on it.
    try { await this.page.keyboard.press('Escape'); await this.page.waitForTimeout(300); } catch (_) {}

    const closeCandidates: Locator[] = [
      this.page.locator('button[aria-label="Close" i]').first(),
      this.page.locator('[role="dialog"] button[aria-label*="close" i]').first(),
      this.page.locator('[role="dialog"]').locator('button').filter({ hasText: /^(close|×|✕|x)$/i }).first(),
      this.page.locator('xpath=//*[self::button or @role="button"][normalize-space(.)="×" or normalize-space(.)="✕" or normalize-space(.)="X"]').first(),
      this.page.getByRole('button', { name: /^(no thanks|maybe later|dismiss|not now|skip|close)$/i }).first(),
    ];
    for (const c of closeCandidates) {
      try {
        if (await c.isVisible({ timeout: 1000 })) {
          await c.click({ timeout: 2000 });
          log('Dismissed a popup');
          await this.page.waitForTimeout(500);
        }
      } catch (_) { /* ignore — popup may not exist */ }
    }
  }

  async clickAddToCart(): Promise<boolean> {
    await this.dismissPopups();
    const candidates: Locator[] = [
      this.page.getByRole('button', { name: /add to (cart|bag)/i }).first(),
      this.page.locator('xpath=//*[self::button or self::a or self::input][contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "add to cart")]').first(),
      this.page.locator('xpath=//*[self::button or self::a or self::input][contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "add to bag")]').first(),
      this.page.locator('button[name="add"]').first(),
    ];

    for (const loc of candidates) {
      try {
        if (await loc.isVisible({ timeout: 4000 })) {
          await loc.scrollIntoViewIfNeeded();
          await loc.click();
          await this.page.waitForTimeout(2000);
          log('Clicked Add To Cart');
          return true;
        }
      } catch (_) { /* try next */ }
    }

    log('Could not click Add To Cart button');
    return false;
  }

  async clickPayNowOrPlaceOrder(): Promise<boolean> {
    await this.dismissPopups();
    const lc = (text: string) =>
      `xpath=//*[self::button or self::a or self::input][contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "${text}")]`;

    const candidates: Locator[] = [
      this.page.getByRole('button', { name: /pay now|place order|proceed to checkout|buy now|^checkout$|pay via|cash on delivery/i }).first(),
      this.page.locator(lc('pay via')).first(),
      this.page.locator(lc('cash on delivery')).first(),
      this.page.locator(lc('pay now')).first(),
      this.page.locator(lc('place order')).first(),
      this.page.locator(lc('proceed to checkout')).first(),
      this.page.locator(lc('buy now')).first(),
      this.page.locator(lc('checkout')).first(),
    ];

    for (const loc of candidates) {
      try {
        if (await loc.isVisible({ timeout: 4000 })) {
          await loc.scrollIntoViewIfNeeded();
          await loc.click();
          log('Clicked Pay Now / Place Order');
          await this.page.waitForTimeout(2000);
          return true;
        }
      } catch (_) { /* try next */ }
    }

    log('Could not click Pay Now / Place Order button');
    await this.page.waitForTimeout(2000);
    return false;
  }
}

export default GenericMerchantPage;
