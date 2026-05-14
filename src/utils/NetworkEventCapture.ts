// @ts-nocheck
import { Page, Request } from '@playwright/test';

// ---------------------------------------------------------------------------
// NetworkEventCapture.ts
// Listens to all outbound requests on the supplied page and classifies them
// into GoKwik, Meta, Google Analytics 4 and Google Ads buckets so tests can
// assert that pixel/event hits fire.
//
// In addition to bucket counts, each request is parsed for the specific
// event name(s) it carries:
//   - Meta:  the `ev` query/body param (InitiateCheckout, AddPaymentInfo, ...)
//   - GA4 :  every `en=` occurrence in the URL and POST body (batched events
//            are one-per-line in the body)
//   - GAds:  the conversion `label` (only fires when conversion endpoints
//            are hit — remarketing pixels are ignored here)
// ---------------------------------------------------------------------------

export interface CapturedEvent {
  url: string;
  method: string;
  type: 'gokwik' | 'meta' | 'ga4' | 'gads' | 'other';
  eventNames: string[];
  postData?: string | null;
  timestamp: number;
}

const PATTERNS = {
  gokwik: [
    /gokwik\.co/i,
    /pdp\.gokwik/i,
    /events\.gokwik/i,
    /api\.gokwik/i,
    /analytics\.gokwik/i,
  ],
  meta: [
    /facebook\.com\/tr/i,
    /connect\.facebook\.net/i,
    /graph\.facebook\.com/i,
  ],
  ga4: [
    /google-analytics\.com\/(g|mp)\/collect/i,
    /analytics\.google\.com\/g\/collect/i,
    /googletagmanager\.com\/gtag/i,
  ],
  gads: [
    /googleadservices\.com/i,
    /google\.com\/(pagead|ads)/i,
    /doubleclick\.net/i,
    /googlesyndication\.com/i,
  ],
};

function classify(url: string): CapturedEvent['type'] {
  for (const key of Object.keys(PATTERNS) as Array<keyof typeof PATTERNS>) {
    if (PATTERNS[key].some((re) => re.test(url))) return key;
  }
  return 'other';
}

// Parse "k1=v1&k2=v2" style strings, return ALL values for the requested key
// (GA4 batched POST bodies repeat `en=` once per event).
function paramValues(source: string | null | undefined, key: string): string[] {
  if (!source) return [];
  const out: string[] = [];
  const re = new RegExp(`(?:^|[?&\\n\\r])${key}=([^&\\n\\r]+)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    try { out.push(decodeURIComponent(m[1])); } catch (_) { out.push(m[1]); }
  }
  return out;
}

function extractEventNames(
  type: CapturedEvent['type'],
  url: string,
  postData: string | null | undefined
): string[] {
  const combined = `${url}\n${postData || ''}`;
  switch (type) {
    case 'meta':
      return paramValues(combined, 'ev');
    case 'ga4':
      return paramValues(combined, 'en');
    case 'gads': {
      // Only conversion endpoints carry a label. Skip remarketing/td pings.
      if (!/\/pagead\/conversion\//i.test(url) && !/\/pagead\/landing/i.test(url)) {
        return [];
      }
      return paramValues(combined, 'label');
    }
    default:
      return [];
  }
}

const log = (msg: string) => console.log(`[NetworkEventCapture] ${msg}`);

export class NetworkEventCapture {
  readonly page: Page;
  private events: CapturedEvent[] = [];
  private listener?: (req: Request) => void;

  constructor(page: Page) {
    this.page = page;
  }

  start(): void {
    this.events = [];
    this.listener = (req: Request) => {
      const url = req.url();
      const type = classify(url);
      if (type === 'other') return;
      const postData = req.postData();
      this.events.push({
        url,
        method: req.method(),
        type,
        eventNames: extractEventNames(type, url, postData),
        postData,
        timestamp: Date.now(),
      });
    };
    this.page.on('request', this.listener);
    log('started');
  }

  stop(): void {
    if (this.listener) {
      this.page.off('request', this.listener);
      this.listener = undefined;
    }
    log(
      `stopped — gokwik=${this.gokwikEvents().length}, meta=${this.metaEvents().length}, ` +
      `ga4=${this.ga4Events().length}, gads=${this.gadsEvents().length}`
    );
  }

  all(): CapturedEvent[] { return [...this.events]; }
  gokwikEvents(): CapturedEvent[] { return this.events.filter((e) => e.type === 'gokwik'); }
  metaEvents(): CapturedEvent[]   { return this.events.filter((e) => e.type === 'meta'); }
  ga4Events(): CapturedEvent[]    { return this.events.filter((e) => e.type === 'ga4'); }
  gadsEvents(): CapturedEvent[]   { return this.events.filter((e) => e.type === 'gads'); }

  hasGokwik(): boolean { return this.gokwikEvents().length > 0; }
  hasMeta(): boolean   { return this.metaEvents().length > 0; }
  hasGa4(): boolean    { return this.ga4Events().length > 0; }
  hasGads(): boolean   { return this.gadsEvents().length > 0; }

  // Distinct event names captured for each bucket.
  metaEventNames(): string[] { return this.distinctNames(this.metaEvents()); }
  ga4EventNames(): string[]  { return this.distinctNames(this.ga4Events()); }
  gadsConversionLabels(): string[] { return this.distinctNames(this.gadsEvents()); }

  // --- ID-filtered helpers (BRD §9/§10/§11) -------------------------------
  // GA4: `tid=<measurementId>` carries the destination property ID.
  ga4EventsForId(measurementId: string): CapturedEvent[] {
    const id = measurementId.trim();
    if (!id) return [];
    return this.ga4Events().filter((e) => this._paramHasValue(e, 'tid', id));
  }
  ga4EventNamesForId(measurementId: string): string[] {
    return this.distinctNames(this.ga4EventsForId(measurementId));
  }
  hasGa4EventForId(name: string, measurementId: string): boolean {
    const target = name.toLowerCase();
    return this.ga4EventNamesForId(measurementId).some((n) => n.toLowerCase() === target);
  }

  // Meta: pixel ID is carried as `id=<pixelId>` on /tr requests.
  metaEventsForPixel(pixelId: string): CapturedEvent[] {
    const id = pixelId.trim();
    if (!id) return [];
    return this.metaEvents().filter((e) => this._paramHasValue(e, 'id', id));
  }
  metaEventNamesForPixel(pixelId: string): string[] {
    return this.distinctNames(this.metaEventsForPixel(pixelId));
  }
  hasMetaEventForPixel(name: string, pixelId: string): boolean {
    const target = name.toLowerCase();
    return this.metaEventNamesForPixel(pixelId).some((n) => n.toLowerCase() === target);
  }

  // GAds: the Adwords ID appears in the URL path (e.g. /pagead/conversion/12345/).
  gadsEventsForAwId(adwordsId: string): CapturedEvent[] {
    const id = adwordsId.replace(/^AW-/i, '').trim();
    if (!id) return [];
    return this.gadsEvents().filter((e) =>
      new RegExp(`(?:/|=)${id}(?:/|&|$|[^0-9])`, 'i').test(e.url)
    );
  }
  gadsLabelsForAwId(adwordsId: string): string[] {
    return this.distinctNames(this.gadsEventsForAwId(adwordsId));
  }

  // True iff at least one captured event contains key=value in URL or body.
  private _paramHasValue(e: CapturedEvent, key: string, value: string): boolean {
    const target = value.toLowerCase();
    const combined = `${e.url}\n${e.postData || ''}`;
    const re = new RegExp(`(?:^|[?&\\n\\r])${key}=([^&\\n\\r]+)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined)) !== null) {
      try {
        if (decodeURIComponent(m[1]).toLowerCase() === target) return true;
      } catch (_) {
        if (m[1].toLowerCase() === target) return true;
      }
    }
    return false;
  }

  hasMetaEvent(name: string): boolean {
    const target = name.toLowerCase();
    return this.metaEventNames().some((n) => n.toLowerCase() === target);
  }
  hasGa4Event(name: string): boolean {
    const target = name.toLowerCase();
    return this.ga4EventNames().some((n) => n.toLowerCase() === target);
  }

  private distinctNames(events: CapturedEvent[]): string[] {
    const set = new Set<string>();
    for (const e of events) for (const n of e.eventNames) if (n) set.add(n);
    return [...set];
  }

  summary() {
    return {
      gokwik: this.gokwikEvents().length,
      meta:   this.metaEvents().length,
      ga4:    this.ga4Events().length,
      gads:   this.gadsEvents().length,
      metaEvents: this.metaEventNames(),
      ga4Events:  this.ga4EventNames(),
      gadsConversionLabels: this.gadsConversionLabels(),
    };
  }
}

export default NetworkEventCapture;
