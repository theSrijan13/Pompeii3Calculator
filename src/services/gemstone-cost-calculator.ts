/**
 * Service for calculating gemstone costs based on product specifications.
 */
import type { EnrichProductSpecificationsOutput } from '@/ai/flows/enrich-product-specifications';
import { getGemstoneData } from '@/services/pricing-source';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface GemstonePriceData {
  productID: string;
  shape: string;
  gemstoneType: string;
  size: string;
  itemPrice: number;
  caratPerUnit?: number;
  [key: string]: any;
}

interface GemstoneDetails {
  gemstoneType?: string;
  gemstoneShape?: string;
  gemstoneSize?: string;
  gemstoneCarat?: number | null;
  quantity?: number | string;
  [key: string]: any;
}

interface BillEntry {
  gemstone_number: number;
  gemstone: string;
  shape: string;
  size: string;
  carat_value: number | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  note: string;
  pricing_method: 'size' | 'carat' | 'no_match';
  matched_from?: string;
  carat_per_unit?: number;
}

interface BillData {
  gemstones: BillEntry[];
  total_bill: number;
  summary: {
    total_gemstones: number;
    matched_gemstones: number;
    unmatched_gemstones: number;
    total_quantity: number;
  };
}

type GemstoneBillResult = {
  billData: BillData | null;
  errors: string[];
  warnings: string[];
  isSuccess: boolean;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_QUANTITY = 1;
const PRICE_PRECISION = 2;
const BASE_GEMSTONE_TYPES = [
    'sapphire', 'amethyst', 'emerald', 'ruby', 'topaz', 'aquamarine', 
    'citrine', 'peridot', 'moissanite', 'tourmaline', 'morganite', 
    'garnet', 'opal'
];


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeString(str: string | undefined): string {
  return (str || '').trim().toLowerCase();
}

/**
 * Normalizes a descriptive gemstone name (e.g., "Natural Blue Sapphire") to its base type (e.g., "sapphire").
 * @param descriptiveName - The full name of the gemstone.
 * @returns The normalized base gemstone name, or the original lowercased name if no base type is found.
 */
function normalizeGemstoneType(descriptiveName: string | undefined): string {
    const lowerName = normalizeString(descriptiveName);
    if (!lowerName) return '';

    for (const baseType of BASE_GEMSTONE_TYPES) {
        if (lowerName.includes(baseType)) {
            return baseType;
        }
    }
    // Return the original normalized name if no base type is found within it
    return lowerName;
}


function parseSize(sizeStr: string): { x: number; y?: number } | null {
  if (!sizeStr) return null;
  const cleaned = normalizeString(sizeStr).replace(/mm/g, '').trim();
  const parts = cleaned.split('x').map(part => parseFloat(part.trim()));
  
  if (parts.some(isNaN)) return null;

  if (parts.length === 1) return { x: parts[0] };
  if (parts.length === 2) return { x: parts[0], y: parts[1] };
  
  return null;
}

// ============================================================================
// MATCHING FUNCTIONS
// ============================================================================

interface MatchResult {
  match: GemstonePriceData | null;
  note: string;
  method: 'size' | 'carat' | 'no_match';
}

function findBestMatch(
    dataSet: GemstonePriceData[], 
    targetSize: { x: number; y?: number } | null, 
    targetCarat: number | null, 
    shape: string
): MatchResult {
    const shapeNormalized = normalizeString(shape);
    const candidates = dataSet.filter(d => normalizeString(d.shape) === shapeNormalized);

    if (candidates.length === 0) {
        return { match: null, note: `No data found for shape: ${shape}`, method: 'no_match' };
    }

    // Priority 1: Size-based matching
    if (targetSize) {
        let exactMatch: GemstonePriceData | null = null;
        let nextLargerMatch: GemstonePriceData | null = null;
        let smallestDiff = Infinity;

        for (const candidate of candidates) {
            const candidateSize = parseSize(candidate.size);
            if (!candidateSize) continue;

            const isExactX = candidateSize.x === targetSize.x;
            const isExactY = !targetSize.y || candidateSize.y === targetSize.y;

            if (isExactX && isExactY) {
                exactMatch = candidate;
                break; // Found perfect match
            }

            const isLargerX = candidateSize.x >= targetSize.x;
            const isLargerY = !targetSize.y || (candidateSize.y && candidateSize.y >= targetSize.y);

            if (isLargerX && isLargerY) {
                const diff = (candidateSize.x - targetSize.x) + ((candidateSize.y || 0) - (targetSize.y || 0));
                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    nextLargerMatch = candidate;
                }
            }
        }
        if (exactMatch) {
            return { match: exactMatch, note: `Exact size match found: ${exactMatch.size}`, method: 'size' };
        }
        if (nextLargerMatch) {
            return { match: nextLargerMatch, note: `No exact size match. Used next largest size: ${nextLargerMatch.size}`, method: 'size' };
        }
    }

    // Priority 2: Carat-based matching (fallback)
    if (targetCarat) {
        let exactMatch: GemstonePriceData | null = null;
        let nextLargerMatch: GemstonePriceData | null = null;
        let smallestDiff = Infinity;

        for (const candidate of candidates) {
            const candidateCarat = candidate.caratPerUnit;
            if (typeof candidateCarat !== 'number') continue;

            if (candidateCarat === targetCarat) {
                exactMatch = candidate;
                break;
            }

            const diff = candidateCarat - targetCarat;
            if (diff > 0 && diff < smallestDiff) {
                smallestDiff = diff;
                nextLargerMatch = candidate;
            }
        }
        if (exactMatch) {
             return { match: exactMatch, note: `Fallback: Exact carat match found: ${exactMatch.caratPerUnit}ct`, method: 'carat' };
        }
        if (nextLargerMatch) {
            return { match: nextLargerMatch, note: `Fallback: No exact carat match. Used next largest carat: ${nextLargerMatch.caratPerUnit}ct`, method: 'carat' };
        }
    }
    
    // Priority 3: Flexible Matching (any stone of the same shape)
    if (candidates.length > 0) {
        // Sort by primary dimension (or carat if no size) and pick the smallest
        candidates.sort((a, b) => {
            const sizeA = parseSize(a.size)?.x || a.caratPerUnit || Infinity;
            const sizeB = parseSize(b.size)?.x || b.caratPerUnit || Infinity;
            return sizeA - sizeB;
        });
        const fallbackMatch = candidates[0];
        return { match: fallbackMatch, note: `Final fallback: Used smallest available '${shape}' stone: ${fallbackMatch.size}`, method: 'size' };
    }

    return { match: null, note: "No suitable match found.", method: 'no_match' };
}


// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateGemstoneEntry(gemDetails: GemstoneDetails, index: number): { entry: BillEntry; error?: string } {
    const gemstoneType = normalizeGemstoneType(gemDetails.gemstoneType);
    const gemstoneShape = normalizeString(gemDetails.gemstoneShape);
    const gemstoneSize = gemDetails.gemstoneSize || '';
    const gemstoneCarat = gemDetails.gemstoneCarat || null;
    const quantity = Number(gemDetails.quantity) || DEFAULT_QUANTITY;

    const baseEntry: Omit<BillEntry, 'unit_price' | 'total_price' | 'note' | 'pricing_method' | 'matched_from' | 'carat_per_unit'> = {
        gemstone_number: index + 1,
        gemstone: gemDetails.gemstoneType || 'N/A',
        shape: gemDetails.gemstoneShape || 'N/A',
        size: gemstoneSize,
        carat_value: gemstoneCarat,
        quantity,
    };

    const rawDataSet = getGemstoneData()[gemstoneType];
    if (!rawDataSet) {
        const error = `No pricing data available for gemstone type: ${gemstoneType}`;
        return {
            entry: { ...baseEntry, unit_price: 0, total_price: 0, note: error, pricing_method: 'no_match' },
            error
        };
    }
    
    // Convert RowObject[] to GemstonePriceData[] - the data already has the required properties from mapGemstoneRows
    const dataSet: GemstonePriceData[] = rawDataSet as GemstonePriceData[];
    
    const parsedSize = parseSize(gemstoneSize);
    
    const { match, note, method } = findBestMatch(dataSet, parsedSize, gemstoneCarat, gemstoneShape);

    if (!match) {
        return {
            entry: { ...baseEntry, unit_price: 0, total_price: 0, note, pricing_method: 'no_match' },
            error: `No match found for ${gemstoneType} (${gemstoneShape}, ${gemstoneSize})`
        };
    }

    const unitPrice = match.itemPrice;
    const totalPrice = unitPrice * quantity;
    const matchedCaratPerUnit = match.caratPerUnit || 0;

    // Update the original gemstone details with the matched carat value
    if (gemDetails) {
        gemDetails.gemstoneCarat = matchedCaratPerUnit;
    }

    const finalEntry: BillEntry = {
        ...baseEntry,
        // CRITICAL: Update carat_value and carat_per_unit with the matched data
        carat_value: matchedCaratPerUnit, 
        carat_per_unit: matchedCaratPerUnit,
        unit_price: Number(unitPrice.toFixed(PRICE_PRECISION)),
        total_price: Number(totalPrice.toFixed(PRICE_PRECISION)),
        note: note,
        pricing_method: method,
        matched_from: `ProductID: ${match.productID}`,
    };

    return { entry: finalEntry };
}


function generateSummary(billEntries: BillEntry[]): BillData['summary'] {
  const totalGemstones = billEntries.length;
  const matchedGemstones = billEntries.filter(entry => entry.pricing_method !== 'no_match').length;
  const unmatched = totalGemstones - matchedGemstones;
  const totalQuantity = billEntries.reduce((sum, entry) => sum + entry.quantity, 0);

  return {
    total_gemstones: totalGemstones,
    matched_gemstones: matchedGemstones,
    unmatched_gemstones: unmatched,
    total_quantity: totalQuantity
  };
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export function calculateGemstoneBill(
  specs: EnrichProductSpecificationsOutput
): GemstoneBillResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!specs?.gemstone_details?.gemstones || specs.gemstone_details.gemstones.length === 0) {
    return { billData: null, errors, warnings, isSuccess: true };
  }

  const billEntries: BillEntry[] = [];
  let totalBill = 0;

  for (const [index, gem] of specs.gemstone_details.gemstones.entries()) {
      const { entry, error } = calculateGemstoneEntry(gem, index);
      billEntries.push(entry);
      if (error) {
          warnings.push(error);
      }
      totalBill += entry.total_price;
  }

  const billData: BillData = {
      gemstones: billEntries,
      total_bill: Number(totalBill.toFixed(PRICE_PRECISION)),
      summary: generateSummary(billEntries)
  };

  return {
      billData,
      errors,
      warnings,
      isSuccess: true
  };
}
