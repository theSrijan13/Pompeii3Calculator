/**
 * Service for calculating diamond costs based on product specifications.
 * This service handles various pricing rules, including special mappings for different diamond types and sizes.
 */
import type { EnrichProductSpecificationsOutput } from '@/ai/flows/enrich-product-specifications';
import { getNaturalDiamondData, getLabDiamondData } from '@/services/pricing-source';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface DiamondPriceData {
  productId: string;
  itemPrice: number;
  caratPerUnit?: number;
  sizeMm?: string;
  [key: string]: any;
}

interface DiamondDetails {
  diamondType?: string;
  carat_value?: string | number;
  quantity?: number | string;
  lookupCode?: string;
  width?: number;
  shape?: string;
  size?: string;
  [key: string]: any;
}

interface ProcessedDiamond {
  type: string;
  caratValue: number;
  quantity: number;
  lookupCode?: string;
  width?: number;
  shape?: string;
  size?: string;
  originalIndex: number;
}

interface BillEntry {
  diamond_number: number;
  diamondType: string;
  width?: number;
  shape?: string;
  size?: string;
  carat_value: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  carat_per_unit: number;
  note: string;
  pricing_method: 'lookup_code' | 'width_based' | 'carat_based' | 'failed';
  product_id?: string;
}

interface BillData {
  diamonds: BillEntry[];
  total_bill: number;
  summary: {
    total_diamonds: number;
    total_quantity: number;
    earring_logic_applied: boolean;
    pricing_methods_used: string[];
  };
}

type DiamondBillResult = {
  billData: BillData | null;
  processedDetails: EnrichProductSpecificationsOutput;
  errors: string[];
  warnings: string[];
  isSuccess: boolean;
};

interface PriceResult {
  unitPrice: number;
  note: string;
  caratPerUnit: number;
  productId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COST_PER_STONE_SETTING = 1;
const BASE_LABOR_COST = 20;
const PRICE_PRECISION = 4;
const BILL_PRECISION = 2;
const CARAT_PRECISION = 3;
const EARRING_TOLERANCE = 0.20; // ±20% tolerance for earring validation

const DIAMOND_TYPES = {
  NATURAL: 'natural',
  LAB: 'lab'
} as const;

const ERROR_TYPES = {
  INVALID_INPUT: "Invalid input data",
  MISSING_DIAMOND_DETAILS: "Missing diamond details",
  EMPTY_DIAMOND_ARRAY: "Empty diamond array",
  INVALID_DIAMOND_DATA: "Invalid diamond data",
  PRICING_DATA_UNAVAILABLE: "Pricing data unavailable",
  CALCULATION_ERROR: "Error in cost calculation",
  INVALID_CARAT_VALUE: "Invalid carat value",
  UNKNOWN_DIAMOND_TYPE: "Unknown diamond type"
} as const;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function validateInput(enrichedSpecs: EnrichProductSpecificationsOutput): string[] {
  const errors: string[] = [];

  if (!enrichedSpecs || typeof enrichedSpecs !== 'object') {
    errors.push(ERROR_TYPES.INVALID_INPUT);
    return errors;
  }

  if (enrichedSpecs.stone_used !== "Yes") {
    // Not an error, just no diamonds to process
    return errors;
  }

  if (!enrichedSpecs.diamond_details) {
    errors.push(ERROR_TYPES.MISSING_DIAMOND_DETAILS);
    return errors;
  }

  if (!Array.isArray(enrichedSpecs.diamond_details.diamonds)) {
    errors.push("Diamond details must contain an array of diamonds");
    return errors;
  }

  if (enrichedSpecs.diamond_details.diamonds.length === 0) {
    errors.push(ERROR_TYPES.EMPTY_DIAMOND_ARRAY);
  }

  return errors;
}

function validateDiamond(diamond: any, index: number): string[] {
  const errors: string[] = [];

  if (!diamond || typeof diamond !== 'object') {
    errors.push(`Diamond ${index + 1}: Invalid diamond object`);
    return errors;
  }

  // At least one of these should be present for pricing
  const hasLookupCode = diamond.lookupCode && typeof diamond.lookupCode === 'string' && diamond.lookupCode.trim() !== '';
  const hasWidth = typeof diamond.width === 'number' && diamond.width > 0;
  const hasCaratValue = diamond.carat_value !== null && diamond.carat_value !== undefined && String(diamond.carat_value).trim() !== '';

  if (!hasLookupCode && !hasWidth && !hasCaratValue) {
    errors.push(`Diamond ${index + 1}: Missing pricing information (lookupCode, width, or carat_value)`);
  }

  const quantity = Number(diamond.quantity);
  if (diamond.quantity !== undefined && (isNaN(quantity) || quantity <= 0)) {
    errors.push(`Diamond ${index + 1}: Invalid quantity - must be a positive number`);
  }

  return errors;
}

function validateRawData(rawData: Record<string, any>): string[] {
  const errors: string[] = [];

  if (!rawData || typeof rawData !== 'object') {
    errors.push("Raw data must be an object");
    return errors;
  }

  return errors;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function safePriceDataAccess(data: any[]): DiamondPriceData[] {
  try {
    if (!Array.isArray(data)) {
      console.warn('Diamond price data is not an array');
      return [];
    }
    return data.filter(item => 
      item && 
      typeof item === 'object' && 
      typeof item.itemPrice === 'number' &&
      item.productId &&
      typeof item.productId === 'string'
    );
  } catch (error) {
    console.error('Error accessing diamond price data:', error);
    return [];
  }
}

function normalizeDiamondType(type: string): string {
  if (!type || typeof type !== 'string') {
    return '';
  }
  
  const normalized = type.toLowerCase().trim();
  
  if (normalized.includes('natural') || normalized.includes('nd')) {
    return DIAMOND_TYPES.NATURAL;
  } else if (normalized.includes('lab') || normalized.includes('ld') || 
             normalized.includes('synthetic') || normalized.includes('created') || 
             normalized.includes('cultured') || normalized.includes('grown')) {
    return DIAMOND_TYPES.LAB;
  }
  
  return normalized;
}

/**
 * Extracts the diamond type from a lookup code
 */
function getDiamondTypeFromLookupCode(lookupCode: string): string {
  if (!lookupCode || typeof lookupCode !== 'string') {
    return 'Natural'; // default
  }
  
  const cleanLookupCode = lookupCode.replace(/\s+plus\s+/gi, "+").trim();
  
  if (cleanLookupCode.toUpperCase().startsWith("LD")) {
    return 'Lab Grown Diamond';
  } else if (cleanLookupCode.toUpperCase().startsWith("ND")) {
    return 'Natural Diamond';
  }
  
  return 'Natural'; // default
}

/**
 * Extracts the numeric part from a Product ID string suffix.
 * Handles formats like ND+13.5, LD.20, ND1.00, LD1.5, ND+8, LD+5 etc.
 */
function extractNumericFromProductId(productId: string): number | null {
  if (!productId || typeof productId !== 'string') {
    return null;
  }

  try {
    // Remove ND or LD prefix (case insensitive)
    let suffixPart = productId.replace(/^(ND|LD)/i, '');
    
    // Skip if contains slash (fraction format handled elsewhere)
    if (suffixPart.includes('/')) {
      return null;
    }
    
    // Remove leading + if present
    const cleanedSuffix = suffixPart.startsWith('+') ? suffixPart.substring(1) : suffixPart;
    
    if (cleanedSuffix !== '' && !isNaN(Number(cleanedSuffix))) {
      const numericValue = parseFloat(cleanedSuffix);
      if (!isNaN(numericValue)) {
        return numericValue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting numeric from product ID:', error);
    return null;
  }
}

/**
 * Converts carat value string to numeric value
 * Handles fractions, decimals, and prefixed values
 */
function getNumericCaratValue(caratValueString: string | number | null | undefined): number {
  if (caratValueString === null || caratValueString === undefined) {
    return NaN;
  }

  let cleanedString = String(caratValueString).trim();
  
  if (cleanedString === '') {
    return NaN;
  }

  try {
    // Remove ND/LD prefix (case insensitive)
    cleanedString = cleanedString.replace(/^(ND|LD)/i, '').trim();
    
    // Remove leading + if present
    cleanedString = cleanedString.startsWith('+') ? cleanedString.substring(1) : cleanedString;

    // Handle fractions (fixed regex)
    if (/^\d+\/\d+$/.test(cleanedString)) {
      const parts = cleanedString.split('/');
      if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
          return numerator / denominator;
        }
      }
    }

    // Handle decimal values
    const numericValue = parseFloat(cleanedString);
    return isNaN(numericValue) ? NaN : numericValue;
  } catch (error) {
    console.error('Error parsing carat value:', error);
    return NaN;
  }
}

/**
 * Parses millimeter size from size string
 */
function parseMmValue(sizeMm: string): number | null {
  if (!sizeMm || typeof sizeMm !== 'string') {
    return null;
  }

  try {
    const cleanSize = sizeMm.toLowerCase().replace(/\s*mm\s*/g, '').trim();
    
    if (cleanSize.includes('-')) {
      // Handle range format like "1.5-2.0"
      const range = cleanSize.split('-');
      if (range.length === 2) {
        const min = parseFloat(range[0]);
        const max = parseFloat(range[1]);
        if (!isNaN(min) && !isNaN(max)) {
          return (min + max) / 2; // Return average
        }
      }
    } else {
      // Handle single value
      const value = parseFloat(cleanSize);
      if (!isNaN(value)) {
        return value;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing MM value:', error);
    return null;
  }
}

// ============================================================================
// PRICING FUNCTIONS
// ============================================================================

/**
 * Finds the diamond price based on a numeric carat value and type.
 * Always rounds up to the next larger size if an exact match isn't found.
 */
function getDiamondPriceByRules(caratValue: number, diamondType: string): PriceResult {
  const normalizedType = normalizeDiamondType(diamondType);
  let dataSet: DiamondPriceData[];
  let typeNote = "";

  if (normalizedType === DIAMOND_TYPES.NATURAL) {
    dataSet = safePriceDataAccess(getNaturalDiamondData() as any);
    typeNote = "(ND)";
  } else if (normalizedType === DIAMOND_TYPES.LAB) {
    dataSet = safePriceDataAccess(getLabDiamondData() as any);
    typeNote = "(LD)";
  } else {
    return { 
      unitPrice: 0, 
      note: `Rule Error: Unknown diamond type ${diamondType}`, 
      caratPerUnit: 0 
    };
  }

  if (dataSet.length === 0) {
    return { 
      unitPrice: 0, 
      note: `Rule Error: Pricing data unavailable ${typeNote}`, 
      caratPerUnit: 0 
    };
  }

  if (isNaN(caratValue) || caratValue <= 0) {
    return { 
      unitPrice: 0, 
      note: `Rule Error: Invalid numeric carat input: ${caratValue}`, 
      caratPerUnit: 0 
    };
  }

  let bestMatch: DiamondPriceData | null = null;
  let nextBiggerMatch: DiamondPriceData | null = null;
  let smallestDiff = Infinity;

  // Determine which field to use for comparison
  const targetValueKey = caratValue < 2 ? 'caratPerUnit' : 'numericProductId';
  
  // Add numeric product ID to data
  const dataWithNumericId = dataSet.map(d => ({
    ...d,
    numericProductId: extractNumericFromProductId(d.productId)
  }));

  for (const row of dataWithNumericId) {
    const rowValue = targetValueKey === 'caratPerUnit' ? row.caratPerUnit : row.numericProductId;
    
    if (rowValue === null || rowValue === undefined || typeof rowValue !== 'number' || isNaN(rowValue)) {
      continue;
    }

    // Check for exact match
    if (Math.abs(rowValue - caratValue) < 0.0001) { // Use small epsilon for floating point comparison
      bestMatch = row;
      break;
    }

    // Find the next bigger match
    const diff = rowValue - caratValue;
    if (diff > 0 && diff < smallestDiff) {
      smallestDiff = diff;
      nextBiggerMatch = row;
    }
  }

  const finalMatch = bestMatch || nextBiggerMatch;

  if (finalMatch) {
    const matchedValue = targetValueKey === 'caratPerUnit' ? finalMatch.caratPerUnit : finalMatch.numericProductId;
    let note;
    
    if (bestMatch) {
      note = `Rule: Matched exact ${targetValueKey === 'caratPerUnit' ? 'Carat/Unit' : 'Product ID'} ${matchedValue} (ID: ${bestMatch.productId})`;
    } else {
      note = `Rule: No exact match found. Rounded up to next bigger ${targetValueKey === 'caratPerUnit' ? 'Carat/Unit' : 'Product ID'}: ${matchedValue} (ID: ${nextBiggerMatch!.productId})`;
    }
    
    return {
      unitPrice: finalMatch.itemPrice || 0,
      note: note,
      caratPerUnit: finalMatch.caratPerUnit || 0,
      productId: finalMatch.productId
    };
  }

  return { 
    unitPrice: 0, 
    note: `Rule: No matching value or larger size found for ${caratValue}`, 
    caratPerUnit: 0 
  };
}

/**
 * Finds diamond price by lookup code (exact match)
 */
function findDiamondByLookupCode(lookupCode: string): PriceResult {
  if (!lookupCode || typeof lookupCode !== 'string') {
    return { unitPrice: 0, note: "Invalid lookup code", caratPerUnit: 0 };
  }

  const cleanLookupCode = lookupCode.replace(/\s+plus\s+/gi, "+").trim();
  const isLabDiamond = cleanLookupCode.toUpperCase().startsWith("LD");
  const dataSet = safePriceDataAccess((isLabDiamond ? getLabDiamondData() : getNaturalDiamondData()) as any);

  const match = dataSet.find(d => d.productId === cleanLookupCode);
  
  if (match) {
    return {
      unitPrice: match.itemPrice || 0,
      note: `Priced via exact lookupCode: ${cleanLookupCode}`,
      caratPerUnit: match.caratPerUnit || 0,
      productId: match.productId
    };
  }

  return { 
    unitPrice: 0, 
    note: `No match for lookupCode: ${cleanLookupCode}`, 
    caratPerUnit: 0 
  };
}

/**
 * Finds diamond price by width (MM size matching)
 */
function findDiamondByWidth(width: number, diamondType: string): PriceResult {
  if (typeof width !== 'number' || width <= 0) {
    return { unitPrice: 0, note: "Invalid width value", caratPerUnit: 0 };
  }

  const normalizedType = normalizeDiamondType(diamondType);
  const isLabDiamond = normalizedType === DIAMOND_TYPES.LAB;
  const dataSet = safePriceDataAccess((isLabDiamond ? getLabDiamondData() : getNaturalDiamondData()) as any);

  let closestEntry: DiamondPriceData | null = null;
  let minDiff = Infinity;

  for (const entry of dataSet) {
    if (!entry.sizeMm) {
      continue;
    }

    const mmValue = parseMmValue(entry.sizeMm);
    if (mmValue === null) {
      continue;
    }

    const diff = Math.abs(mmValue - width);
    if (diff < minDiff) {
      minDiff = diff;
      closestEntry = entry;
    }
  }

  if (closestEntry && closestEntry.caratPerUnit) {
    const priceResult = getDiamondPriceByRules(closestEntry.caratPerUnit, diamondType);
    return {
      unitPrice: priceResult.unitPrice,
      note: `Priced via MM width (${width}mm -> ~${closestEntry.sizeMm}): ${priceResult.note}`,
      caratPerUnit: priceResult.caratPerUnit,
      productId: priceResult.productId
    };
  }

  return { 
    unitPrice: 0, 
    note: `No matching MM width found for: ${width}mm`, 
    caratPerUnit: 0 
  };
}

// ============================================================================
// EARRING LOGIC
// ============================================================================

function shouldApplyEarringLogic(
  rawData: Record<string, any>, 
  diamonds: DiamondDetails[]
): { shouldApply: boolean; note: string } {
  const classification = (rawData.Classification || "").toLowerCase();
  const isEarring = classification.includes('earring');
  
  if (!isEarring) {
    return { shouldApply: false, note: "" };
  }

  const exactTotalCarat = parseFloat(rawData['Exact Carat Total Weight']);
  
  if (isNaN(exactTotalCarat) || exactTotalCarat <= 0) {
    return { 
      shouldApply: true, 
      note: "Earring detected but no exact total weight available. Applying halving logic." 
    };
  }

  // Calculate hypothetical total with halved carats
  let hypotheticalTotalCarat = 0;
  for (const diamond of diamonds) {
    const quantity = (typeof diamond.quantity === 'number' && diamond.quantity > 0) ? diamond.quantity : 1;
    const numericCarat = getNumericCaratValue(diamond.carat_value);
    if (!isNaN(numericCarat)) {
      hypotheticalTotalCarat += (numericCarat / 2) * quantity;
    }
  }

  const lowerBound = exactTotalCarat * (1 - EARRING_TOLERANCE);
  const upperBound = exactTotalCarat * (1 + EARRING_TOLERANCE);

  if (hypotheticalTotalCarat < lowerBound || hypotheticalTotalCarat > upperBound) {
    return {
      shouldApply: false,
      note: `Earring halving logic overridden: Halved weight (${hypotheticalTotalCarat.toFixed(CARAT_PRECISION)}ct) was outside ±${EARRING_TOLERANCE * 100}% of Exact Total Weight (${exactTotalCarat}ct). Using original carat values.`
    };
  }

  return { 
    shouldApply: true, 
    note: `Earring detected. Applying carat halving logic. Total validation: ${hypotheticalTotalCarat.toFixed(CARAT_PRECISION)}ct vs ${exactTotalCarat}ct (within tolerance).` 
  };
}

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

function calculateDiamondEntry(
  diamond: DiamondDetails, 
  index: number, 
  useHalvedCaratLogic: boolean,
  earringNote: string
): BillEntry {
  const quantity = (typeof diamond.quantity === 'number' && diamond.quantity > 0) ? diamond.quantity : 1;
  
  // Determine diamond type: first check lookup code, then fallback to diamondType field, then default to Natural
  let diamondType = diamond.diamondType || 'Natural';
  if (diamond.lookupCode && typeof diamond.lookupCode === 'string') {
    diamondType = getDiamondTypeFromLookupCode(diamond.lookupCode);
  }
  
  let priceResult: PriceResult;
  let pricingMethod: BillEntry['pricing_method'];
  let finalCaratValueForDisplay = String(diamond.carat_value || '');

  // Pricing hierarchy: lookupCode -> width -> carat_value
  if (diamond.lookupCode) {
    priceResult = findDiamondByLookupCode(diamond.lookupCode);
    pricingMethod = 'lookup_code';
    // If we get a valid result from lookup, use its carat value for display and further logic
    if (priceResult.unitPrice > 0 && priceResult.caratPerUnit > 0) {
      finalCaratValueForDisplay = String(priceResult.caratPerUnit);
      diamond.carat_value = priceResult.caratPerUnit; // IMPORTANT: Update the diamond's carat_value for subsequent logic
    }
  } else if (typeof diamond.width === 'number' && diamond.width > 0) {
    priceResult = findDiamondByWidth(diamond.width, diamondType);
    pricingMethod = 'width_based';
  } else if (diamond.carat_value !== undefined && diamond.carat_value !== null) {
    let caratNumericForRules = getNumericCaratValue(diamond.carat_value);
    
    if (isNaN(caratNumericForRules)) {
      priceResult = { unitPrice: 0, note: `Invalid numeric carat for pricing: ${diamond.carat_value}`, caratPerUnit: 0 };
      pricingMethod = 'failed';
    } else {
      // Apply earring logic if needed
      if (useHalvedCaratLogic) {
        const originalCarat = caratNumericForRules;
        caratNumericForRules /= 2;
        finalCaratValueForDisplay = String(caratNumericForRules.toFixed(CARAT_PRECISION));
      } else {
        finalCaratValueForDisplay = String(caratNumericForRules.toFixed(CARAT_PRECISION));
      }
      
      priceResult = getDiamondPriceByRules(caratNumericForRules, diamondType);
      pricingMethod = 'carat_based';
    }
  } else {
    priceResult = { unitPrice: 0, note: "Missing pricing information (lookupCode, width, or carat_value)", caratPerUnit: 0 };
    pricingMethod = 'failed';
  }

  const unitPrice = priceResult.unitPrice || 0;
  const totalPrice = unitPrice * quantity;

  // Combine notes
  const finalNote = [earringNote, priceResult.note].filter(Boolean).join(' ').trim();

  return {
    diamond_number: index + 1,
    diamondType: diamondType,
    width: diamond.width,
    shape: diamond.shape,
    size: diamond.size,
    carat_value: finalCaratValueForDisplay,
    quantity: quantity,
    unit_price: Number(unitPrice.toFixed(PRICE_PRECISION)),
    total_price: Number(totalPrice.toFixed(BILL_PRECISION)),
    carat_per_unit: Number((priceResult.caratPerUnit || 0).toFixed(PRICE_PRECISION)),
    note: finalNote,
    pricing_method: pricingMethod,
    product_id: priceResult.productId
  };
}

function generateSummary(billEntries: BillEntry[], earringLogicApplied: boolean): BillData['summary'] {
  const totalDiamonds = billEntries.length;
  const totalQuantity = billEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const pricingMethods = [...new Set(billEntries.map(entry => entry.pricing_method))];

  return {
    total_diamonds: totalDiamonds,
    total_quantity: totalQuantity,
    earring_logic_applied: earringLogicApplied,
    pricing_methods_used: pricingMethods
  };
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Calculates diamond costs from pre-processed AI details.
 */
export function calculateDiamondBill(
  rawData: Record<string, any>, 
  enrichedSpecs: EnrichProductSpecificationsOutput
): DiamondBillResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Validate raw data
    const rawDataErrors = validateRawData(rawData);
    if (rawDataErrors.length > 0) {
      return {
        billData: null,
        processedDetails: enrichedSpecs,
        errors: rawDataErrors,
        warnings: [],
        isSuccess: false
      };
    }

    // Validate input
    const inputErrors = validateInput(enrichedSpecs);
    if (inputErrors.length > 0) {
      // If no diamonds to process, return success with null bill data
      if (enrichedSpecs?.stone_used !== "Yes") {
        return {
          billData: null,
          processedDetails: enrichedSpecs,
          errors: [],
          warnings: ["No diamonds to process (stone_used is not 'Yes')"],
          isSuccess: true
        };
      }
      
      return {
        billData: null,
        processedDetails: enrichedSpecs,
        errors: inputErrors,
        warnings: [],
        isSuccess: false
      };
    }

    const rawDiamonds = enrichedSpecs.diamond_details?.diamonds ?? [];
    const diamonds: DiamondDetails[] = rawDiamonds.map((d: any) => ({
      ...d,
      // Ensure types align with DiamondDetails
      carat_value: d?.carat_value ?? undefined,
      size: typeof d?.size === 'string' ? d.size : (d?.size != null ? String(d.size) : undefined),
    }));
    const billEntries: BillEntry[] = [];
    let totalBill = 0;

    // Determine earring logic
    const earringLogic = shouldApplyEarringLogic(rawData, diamonds);
    let earringNote = earringLogic.note;

    // Process each diamond
    diamonds.forEach((diamond: DiamondDetails, index: number) => {
      const validationErrors = validateDiamond(diamond, index);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
        return;
      }

      try {
        const billEntry = calculateDiamondEntry(
          diamond, 
          index, 
          earringLogic.shouldApply,
          earringNote
        );
        
        billEntries.push(billEntry);
        totalBill += billEntry.total_price;

        // Add warnings for failed pricing
        if (billEntry.pricing_method === 'failed') {
          warnings.push(`Diamond ${billEntry.diamond_number}: Pricing failed - ${billEntry.note}`);
        } else if (billEntry.unit_price === 0) {
          warnings.push(`Diamond ${billEntry.diamond_number}: Zero price calculated - verify data`);
        }

        // Clear earring note after first diamond to avoid repetition
        earringNote = '';
      } catch (error) {
        const errorMsg = `Error calculating diamond ${index + 1}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
      }
    });

    // If there are critical errors and no successful calculations, return failure
    if (errors.length > 0 && billEntries.length === 0) {
      return {
        billData: null,
        processedDetails: enrichedSpecs,
        errors,
        warnings,
        isSuccess: false
      };
    }

    // Generate summary
    const summary = generateSummary(billEntries, earringLogic.shouldApply);

    const billData: BillData = {
      diamonds: billEntries,
      total_bill: Number(totalBill.toFixed(BILL_PRECISION)),
      summary
    };

    return {
      billData,
      processedDetails: enrichedSpecs,
      errors,
      warnings,
      isSuccess: true
    };

  } catch (error) {
    const errorMsg = `Unexpected error in diamond calculation: ${error instanceof Error ? error.message : String(error)}`;
    
    return {
      billData: null,
      processedDetails: enrichedSpecs,
      errors: [errorMsg],
      warnings,
      isSuccess: false
    };
  }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export {
  type DiamondBillResult,
  type BillEntry,
  type BillData,
  type DiamondDetails,
  type ProcessedDiamond,
  type DiamondPriceData,
  type PriceResult,
  COST_PER_STONE_SETTING,
  BASE_LABOR_COST,
  ERROR_TYPES,
  DIAMOND_TYPES,
  extractNumericFromProductId,
  getNumericCaratValue,
  getDiamondPriceByRules,
  findDiamondByLookupCode,
  findDiamondByWidth,
  validateInput,
  validateDiamond,
  normalizeDiamondType,
  getDiamondTypeFromLookupCode
};
