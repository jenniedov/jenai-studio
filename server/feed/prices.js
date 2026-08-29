// jenai.house price feed. Pulls the daily "who's cheapest" matrix once a day,
// caches it locally, and exposes real per-provider prices for our models. The
// UI uses this so every generation shows an accurate, up-front cost — per image
// for images, per second × length for video.
//
// Docs: https://jenai.house  (FEEDINTEGRATION.md). Auth: Bearer <feed key>.
// Rate limit is 10/day, so we refresh at most once per ~20h and cache the rest.

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { getKey, dataDir } from '../storage/store.js';

const FEED_URL = 'https://jenai.house/api/feed/prices.json';
const CACHE_PATH = () => join(dataDir(), 'price-feed.json');
const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000; // once a day is enough; feed updates nightly
const USABLE = new Set(['kie', 'oxen', 'openrouter']); // providers we can actually run

// Our model key -> the feed's model slug (+ a fixed variant for the sub-models
// the feed folds into one model as variants). Models absent here have no feed
// price and fall back to the rough config price.
const MODEL_TO_FEED = {
  'gpt-image-2': { slug: 'gpt-image-2' },
  'nano-banana-2': { slug: 'nano-banana-2' },
  'nano-banana-pro': { slug: 'nano-banana-pro' },
  'seedance-2-5': { slug: 'seedance-2-5' },
  'seedance-2-0': { slug: 'seedance-2' },
  'seedance-2-0-fast': { slug: 'seedance-2', variant: 'fast-720p' },
  'seedance-2-0-mini': { slug: 'seedance-2', variant: 'mini-720p' },
  'veo-3-1': { slug: 'veo-3-1' },
  'gemini-omni-flash': { slug: 'gemini-omni-flash' },
  'kling-2-6': { slug: 'kling-3' },
};

let cache = null; // { fetchedAt, asOf, rows }

function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(CACHE_PATH(), 'utf8')); } catch { cache = null; }
  return cache;
}

function saveCache(next) {
  cache = next;
  try { writeFileSync(CACHE_PATH(), JSON.stringify(next)); chmodSync(CACHE_PATH(), 0o600); } catch { /* best effort */ }
}

// Refresh the feed if the cache is missing or older than ~a day. Safe to call on
// startup and on demand; never throws, and keeps the old cache on any failure.
export async function refreshFeed({ force = false } = {}) {
  const key = getKey('jenaifeed');
  if (!key) return { ok: false, reason: 'no_key' };
  const c = loadCache();
  const age = c?.fetchedAt ? Date.now() - Date.parse(c.fetchedAt) : Infinity;
  if (!force && c && age < REFRESH_AFTER_MS) return { ok: true, reason: 'fresh', asOf: c.asOf };
  try {
    const res = await fetch(FEED_URL, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 429) return { ok: true, reason: 'rate_limited', asOf: c?.asOf }; // keep cache
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, asOf: c?.asOf };
    const body = await res.json();
    saveCache({ fetchedAt: new Date().toISOString(), asOf: body.asOf, rows: body.rows || [] });
    return { ok: true, reason: 'refreshed', asOf: body.asOf };
  } catch (e) {
    return { ok: false, reason: 'network', asOf: c?.asOf };
  }
}

// Rows for one of our models on the usable providers, pay-as-you-go only (that's
// what a bring-your-own-key user actually pays). Sub-model variants (fast-/mini-)
// are kept out of the parent model.
function rowsForModel(modelKey) {
  const map = MODEL_TO_FEED[modelKey];
  const c = loadCache();
  if (!map || !c?.rows) return [];
  return c.rows.filter((r) => {
    if (r.model !== map.slug) return false;
    if (r.billingPeriod !== 'payg') return false;
    if (!USABLE.has(r.provider)) return false;
    if (map.variant) return r.variant === map.variant;
    return !/^fast-|^mini-/.test(r.variant); // parent model excludes sub-model variants
  });
}

// Compact price table for the client: { unit, providers: { id: [rows...] } }.
// One entry per model that has any feed price.
export function priceTable() {
  const out = {};
  for (const modelKey of Object.keys(MODEL_TO_FEED)) {
    const rows = rowsForModel(modelKey);
    if (!rows.length) continue;
    const providers = {};
    for (const r of rows) {
      (providers[r.provider] ||= []).push({
        variant: r.variant,
        price: r.price,
        isTemporary: r.isTemporary,
        temporaryNote: r.temporaryNote || '',
        activeDeal: r.activeDeal || '',
        link: r.link || '',
      });
    }
    out[modelKey] = { unit: rows[0].unit, providers };
  }
  return out;
}

export function feedMeta() {
  const c = loadCache();
  return { asOf: c?.asOf || null, fetchedAt: c?.fetchedAt || null };
}
