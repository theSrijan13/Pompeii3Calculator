/**
 * Centralized pricing source with Google Sheets fetch + fallback to src/data/pricing.ts
 * Provides synchronous getters backed by module-level caches that are preloaded at runtime.
 */
import {
  NATURAL_DIAMOND_DATA as FALLBACK_NATURAL_DIAMOND_DATA,
  LAB_DIAMOND_DATA as FALLBACK_LAB_DIAMOND_DATA,
  LEES_SUPPLIER_DATA as FALLBACK_LEES_SUPPLIER_DATA,
  GEMSTONE_DATA as FALLBACK_GEMSTONE_DATA,
} from '@/data/pricing';

import {
  GOOGLE_SHEETS_ID,
  GOOGLE_SHEETS_URL,
  GOOGLE_API_KEY,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_KEY,
  SHEET_NATURAL_DIAMOND_DATA,
  SHEET_LAB_DIAMOND_DATA,
  SHEET_LEES_SUPPLIER_DATA,
  SHEET_METAL_COST,
  SHEET_LABOR_COST,
  SHEET_SAPPHIRE_GEMSTONE_DATA,
  SHEET_TOURMALINE_GEMSTONE_DATA,
  SHEET_PERIDOT_GEMSTONE_DATA,
  SHEET_RUBY_GEMSTONE_DATA,
  SHEET_TOPAZ_GEMSTONE_DATA,
  SHEET_AMETHYST_GEMSTONE_DATA,
  SHEET_CITRINE_GEMSTONE_DATA,
} from '@/config';

type RowObject = Record<string, any>;

// Module-level caches (sync access) - LEGACY: Use on-demand functions instead
let naturalDiamondData: RowObject[] = FALLBACK_NATURAL_DIAMOND_DATA;
let labDiamondData: RowObject[] = FALLBACK_LAB_DIAMOND_DATA;
let leesSupplierData: RowObject[] = FALLBACK_LEES_SUPPLIER_DATA as any[];
let gemstoneDataByType: Record<string, RowObject[]> = FALLBACK_GEMSTONE_DATA as any;
let metalRatesPerGram: Record<string, number> | null = null; // e.g., { '14k': 60 }
let laborCosts: { settingCostPerStone: number; fixedLaborCost: number } | null = null;

let preloadAttempted = false;
let preloadSucceeded = false;

// ON-DEMAND FETCHING - No caching, fresh data every time

function resolveSheetId(): string | null {
  if (GOOGLE_SHEETS_ID && typeof GOOGLE_SHEETS_ID === 'string' && GOOGLE_SHEETS_ID.trim()) return GOOGLE_SHEETS_ID.trim();
  if (GOOGLE_SHEETS_URL && typeof GOOGLE_SHEETS_URL === 'string') {
    const m = GOOGLE_SHEETS_URL.match(/\/spreadsheets\/d\/([^/]+)/);
    if (m && m[1]) return m[1];
  }
  return null;
}

function sheetUrl(sheetName: string): string | null {
  const id = resolveSheetId();
  if (!id) return null;
  const encoded = encodeURIComponent(sheetName);
  return `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encoded}`;
}

async function getAccessHeaders(): Promise<HeadersInit> {
  // Prefer service account; fallback to API key query param handled later
  if (GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_SERVICE_ACCOUNT_KEY) {
    const token = await getServiceAccountAccessToken();
    if (token) return { Authorization: `Bearer ${token}` } as HeadersInit;
  }
  return {} as HeadersInit;
}

async function fetchSheetRows(sheetName: string): Promise<RowObject[] | null> {
  let url = sheetUrl(sheetName);
  if (!url) return null;
  // If no service account configured, append API key
  if (!(GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_SERVICE_ACCOUNT_KEY)) {
    if (!GOOGLE_API_KEY) return null;
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}key=${GOOGLE_API_KEY}`;
  }
  const authHeaders: HeadersInit = await getAccessHeaders();
  const res = await fetch(url, { cache: 'no-store' as any, headers: authHeaders });
  if (!res.ok) return null;
  const json: any = await res.json();
  const values: any[] = json.values || [];
  if (!values.length) return [];
  const sheetHeaders: string[] = (values[0] || []).map((h: any) => String(h).trim());
  const rows: RowObject[] = [];
  for (let i = 1; i < values.length; i++) {
    const row: any[] = values[i] || [];
    const obj: RowObject = {};
    sheetHeaders.forEach((h: string, idx: number) => {
      obj[h] = row[idx] !== undefined ? coerceValue(row[idx]) : undefined;
    });
    rows.push(obj);
  }
  return rows;
}

function coerceValue(v: any): any {
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  if (trimmed === '') return '';
  const num = Number(trimmed.replace(/\$/g, ''));
  return isNaN(num) ? trimmed : num;
}

function normalizeGemstoneTypeKey(type: string): string {
  return (type || '').toLowerCase().trim();
}

function mapDiamondRows(rows: RowObject[]): RowObject[] {
  return rows.map(r => ({
    category: r.category,
    productId: String(r.productID ?? r.productId ?? ''),
    ppc: Number(r.ppc ?? 0),
    caratPerUnit: Number(r.caratPerUnit ?? 0),
    itemPrice: Number(r.itemPrice ?? 0),
    description: r.description,
    size: r.size,
    sizeMm: r.sizeMm ?? r.size,
  }));
}

function mapLeesRows(rows: RowObject[]): RowObject[] {
  return rows.map(r => ({
    'Item Number': String(r['Item Number'] ?? r.itemNumber ?? r.item_number ?? ''),
    'Per Piece': Number(r['Per Piece'] ?? r.perPiece ?? r['New Price Per Piece'] ?? 0),
    '250 per 100 pcs': Number(r['250 per 100 pcs'] ?? r['250_per_100'] ?? 0),
    'Increment per 100 pcs': Number(r['Increment per 100 pcs'] ?? r['increment_per_100'] ?? 0),
    'Dwt per 100 pcs': Number(r['Dwt per 100 pcs'] ?? r['dwt_per_100'] ?? 0),
  }));
}

function mapGemstoneRows(rows: RowObject[], gemstoneType: string): RowObject[] {
  return rows.map(r => ({
    category: r.category,
    productID: String(r.productID ?? r.productId ?? ''),
    ppc: Number(r.ppc ?? 0),
    caratPerUnit: Number(r.caratPerUnit ?? 0),
    itemPrice: Number(r.itemPrice ?? 0),
    shape: r.shape,
    size: r.size,
    gemstoneType: gemstoneType,
  }));
}

function mapMetalRates(rows: RowObject[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const purity = String(r['Metal purity'] ?? r.purity ?? '').toLowerCase().trim();
    const rate = Number(r['Metal Rate per gram'] ?? r.rate ?? r.perGram ?? NaN);
    if (purity && !isNaN(rate)) out[purity] = rate;
  }
  return out;
}

function mapLabor(rows: RowObject[]): { settingCostPerStone: number; fixedLaborCost: number } | null {
  if (!rows.length) return null;
  // Use first row
  const r = rows[0];
  const setting = Number(r['Setting cost per Stone'] ?? r.setting ?? r.settingCostPerStone ?? NaN);
  const fixed = Number(r['Fixed Labor Cost'] ?? r.fixed ?? r.fixedLaborCost ?? NaN);
  return {
    settingCostPerStone: isNaN(setting) ? 1 : setting,
    fixedLaborCost: isNaN(fixed) ? 20 : fixed,
  };
}

// ON-DEMAND FETCH FUNCTIONS - Always fresh, no caching
export async function fetchFreshNaturalDiamondData(): Promise<RowObject[]> {
  try {
    const rows = await fetchSheetRows(SHEET_NATURAL_DIAMOND_DATA);
    return rows && rows.length ? mapDiamondRows(rows) : FALLBACK_NATURAL_DIAMOND_DATA;
  } catch (e) {
    console.warn('Failed to fetch fresh natural diamond data, using fallback:', e);
    return FALLBACK_NATURAL_DIAMOND_DATA;
  }
}

export async function fetchFreshLabDiamondData(): Promise<RowObject[]> {
  try {
    const rows = await fetchSheetRows(SHEET_LAB_DIAMOND_DATA);
    return rows && rows.length ? mapDiamondRows(rows) : FALLBACK_LAB_DIAMOND_DATA;
  } catch (e) {
    console.warn('Failed to fetch fresh lab diamond data, using fallback:', e);
    return FALLBACK_LAB_DIAMOND_DATA;
  }
}

export async function fetchFreshLeesSupplierData(): Promise<RowObject[]> {
  try {
    const rows = await fetchSheetRows(SHEET_LEES_SUPPLIER_DATA);
    return rows && rows.length ? mapLeesRows(rows) : FALLBACK_LEES_SUPPLIER_DATA as any[];
  } catch (e) {
    console.warn('Failed to fetch fresh Lee\'s supplier data, using fallback:', e);
    return FALLBACK_LEES_SUPPLIER_DATA as any[];
  }
}

export async function fetchFreshMetalRates(): Promise<Record<string, number> | null> {
  try {
    const rows = await fetchSheetRows(SHEET_METAL_COST);
    return rows && rows.length ? mapMetalRates(rows) : null;
  } catch (e) {
    console.warn('Failed to fetch fresh metal rates:', e);
    return null;
  }
}

export async function fetchFreshLaborCosts(): Promise<{ settingCostPerStone: number; fixedLaborCost: number } | null> {
  try {
    const rows = await fetchSheetRows(SHEET_LABOR_COST);
    return rows && rows.length ? mapLabor(rows) : null;
  } catch (e) {
    console.warn('Failed to fetch fresh labor costs:', e);
    return null;
  }
}

export async function fetchFreshGemstoneData(): Promise<Record<string, RowObject[]>> {
  try {
    const gemstoneSheets: Array<{ name: string; key: string }> = [
      { name: SHEET_SAPPHIRE_GEMSTONE_DATA, key: 'sapphire' },
      { name: SHEET_TOURMALINE_GEMSTONE_DATA, key: 'tourmaline' },
      { name: SHEET_PERIDOT_GEMSTONE_DATA, key: 'peridot' },
      { name: SHEET_RUBY_GEMSTONE_DATA, key: 'ruby' },
      { name: SHEET_TOPAZ_GEMSTONE_DATA, key: 'topaz' },
      { name: SHEET_AMETHYST_GEMSTONE_DATA, key: 'amethyst' },
      { name: SHEET_CITRINE_GEMSTONE_DATA, key: 'citrine' },
    ];
    
    const gemstoneResults = await Promise.all(gemstoneSheets.map(s => fetchSheetRows(s.name)));
    const assembled: Record<string, RowObject[]> = { ...(FALLBACK_GEMSTONE_DATA as any) };
    
    gemstoneResults.forEach((rows, idx) => {
      const meta = gemstoneSheets[idx];
      if (rows && rows.length) {
        assembled[normalizeGemstoneTypeKey(meta.key)] = mapGemstoneRows(rows, meta.key);
      }
    });
    
    return assembled;
  } catch (e) {
    console.warn('Failed to fetch fresh gemstone data, using fallback:', e);
    return FALLBACK_GEMSTONE_DATA as any;
  }
}

// Fetch all pricing data fresh (no caching)
export async function fetchAllFreshPricingData(): Promise<{
  naturalDiamonds: RowObject[];
  labDiamonds: RowObject[];
  leesSupplier: RowObject[];
  gemstones: Record<string, RowObject[]>;
  metalRates: Record<string, number> | null;
  laborCosts: { settingCostPerStone: number; fixedLaborCost: number } | null;
}> {
  const [naturalDiamonds, labDiamonds, leesSupplier, gemstones, metalRates, laborCosts] = await Promise.all([
    fetchFreshNaturalDiamondData(),
    fetchFreshLabDiamondData(),
    fetchFreshLeesSupplierData(),
    fetchFreshGemstoneData(),
    fetchFreshMetalRates(),
    fetchFreshLaborCosts(),
  ]);

  return {
    naturalDiamonds,
    labDiamonds,
    leesSupplier,
    gemstones,
    metalRates,
    laborCosts,
  };
}

export async function preloadPricingFromGoogleSheets(force: boolean = false): Promise<void> {
  if (preloadAttempted && !force) return; // Best-effort, single attempt per runtime unless forced
  preloadAttempted = true;
  try {
    // Fast exit if no config present
    if (!resolveSheetId()) {
      preloadSucceeded = false;
      return;
    }
    // Diamonds
    const [ndRows, ldRows] = await Promise.all([
      fetchSheetRows(SHEET_NATURAL_DIAMOND_DATA),
      fetchSheetRows(SHEET_LAB_DIAMOND_DATA),
    ]);
    if (ndRows && ndRows.length) naturalDiamondData = mapDiamondRows(ndRows);
    if (ldRows && ldRows.length) labDiamondData = mapDiamondRows(ldRows);

    // Supplier (Lee's)
    const leesRows = await fetchSheetRows(SHEET_LEES_SUPPLIER_DATA);
    if (leesRows && leesRows.length) leesSupplierData = mapLeesRows(leesRows);

    // Metal rates
    const metalRows = await fetchSheetRows(SHEET_METAL_COST);
    if (metalRows && metalRows.length) metalRatesPerGram = mapMetalRates(metalRows);

    // Labor costs
    const laborRows = await fetchSheetRows(SHEET_LABOR_COST);
    if (laborRows && laborRows.length) laborCosts = mapLabor(laborRows);

    // Gemstones by sheet/type
    const gemstoneSheets: Array<{ name: string; key: string }> = [
      { name: SHEET_SAPPHIRE_GEMSTONE_DATA, key: 'sapphire' },
      { name: SHEET_TOURMALINE_GEMSTONE_DATA, key: 'tourmaline' },
      { name: SHEET_PERIDOT_GEMSTONE_DATA, key: 'peridot' },
      { name: SHEET_RUBY_GEMSTONE_DATA, key: 'ruby' },
      { name: SHEET_TOPAZ_GEMSTONE_DATA, key: 'topaz' },
      { name: SHEET_AMETHYST_GEMSTONE_DATA, key: 'amethyst' },
      { name: SHEET_CITRINE_GEMSTONE_DATA, key: 'citrine' },
    ];
    const gemstoneResults = await Promise.all(gemstoneSheets.map(s => fetchSheetRows(s.name)));
    const assembled: Record<string, RowObject[]> = { ...gemstoneDataByType };
    gemstoneResults.forEach((rows, idx) => {
      const meta = gemstoneSheets[idx];
      if (rows && rows.length) {
        assembled[normalizeGemstoneTypeKey(meta.key)] = mapGemstoneRows(rows, meta.key);
      }
    });
    gemstoneDataByType = assembled;

    preloadSucceeded = true;
  } catch (e) {
    // Silent fallback to existing static data
    preloadSucceeded = false;
  }
}

// Function to update cache with fresh data (for on-demand scenarios)
export function updateCacheWithFreshData(freshData: {
  naturalDiamonds: RowObject[];
  labDiamonds: RowObject[];
  leesSupplier: RowObject[];
  gemstones: Record<string, RowObject[]>;
  metalRates: Record<string, number> | null;
  laborCosts: { settingCostPerStone: number; fixedLaborCost: number } | null;
}) {
  naturalDiamondData = freshData.naturalDiamonds;
  labDiamondData = freshData.labDiamonds;
  leesSupplierData = freshData.leesSupplier;
  gemstoneDataByType = freshData.gemstones;
  metalRatesPerGram = freshData.metalRates;
  laborCosts = freshData.laborCosts;
}

// Synchronous getters used by services
export function getNaturalDiamondData(): RowObject[] { return naturalDiamondData; }
export function getLabDiamondData(): RowObject[] { return labDiamondData; }
export function getLeesSupplierData(): RowObject[] { return leesSupplierData; }
export function getGemstoneData(): Record<string, RowObject[]> { return gemstoneDataByType; }
export function getMetalRates(): Record<string, number> | null { return metalRatesPerGram; }
export function getLaborCosts(): { settingCostPerStone: number; fixedLaborCost: number } | null { return laborCosts; }
export function isPricingPreloaded(): boolean { return preloadSucceeded; }

// Service Account JWT (for private sheets)
async function getServiceAccountAccessToken(): Promise<string | null> {
  try {
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_KEY) return null;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
      iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const signingInput = `${header}.${payload}`;
    const keyPem = GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');
    const signature = await signRS256(signingInput, keyPem);
    const jwt = `${signingInput}.${signature}`;
    const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt });
    const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signRS256(signingInput: string, privateKeyPem: string): Promise<string> {
  const crypto = await import('crypto');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(privateKeyPem);
  return sig.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}


