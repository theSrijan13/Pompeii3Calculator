/**
 * Service for calculating metal costs based on supplier and pricing rules.
 */
import { getLeesSupplierData, getMetalRates } from '@/services/pricing-source';
import type { EnrichProductSpecificationsOutput } from '@/ai/flows/enrich-product-specifications';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

interface SupplierData {
  'Supplier Name'?: string;
  'MFG & Part #'?: string;
  'Part #2'?: string;
  [key: string]: any; // Allow additional properties
}

interface LeesDataItem {
  "Item Number": string;
  "Per Piece": number;
  [key: string]: any;
}

interface LookupResult {
  price: number | null;
  matchType: 'exact' | 'progressive' | 'substring' | 'multiple_matches' | 'no_match' | 'not_provided';
  processed: string;
  searchAttempts: number;
  error?: string;
}

interface CalculationResult {
  supplier: string;
  metalCost: number | null;
  calculationMethod: 'standard' | 'supplier_specific' | 'standard_fallback';
  details: Record<string, any>;
  errors: string[];
  isSuccess: boolean;
}

interface LookupDetails {
  original: string;
  processed: string;
  matchType: string;
  perPiecePrice: number | null;
  searchAttempts: number;
}

interface PurityDetails {
  original: string;
  processed: string;
  matchType: string;
  perPiecePrice: number | string;
}

interface WeightDetails {
  original: string;
  processed: number;
  matchType: string;
  perPiecePrice: string;
}

// Enhanced specifications interface to handle various input types
interface ProcessedSpecifications {
  metal_purity: string;
  metal_weight: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STANDARD_METAL_RATES: Record<string, number> = {
  '10k': 43,
  '14k': 60,
  '18k': 80,
  '950': 32, // Platinum
};

const ERROR_TYPES = {
  MULTIPLE_MATCHES: "Multiple items found - ambiguous match",
  NO_MATCH_FOUND: "No matching item found in dataset",
  MISSING_ATTRIBUTE: "Required attribute not provided",
  CALCULATION_ERROR: "Error in cost calculation",
  INVALID_SUPPLIER_DATA: "Invalid supplier data provided",
  INVALID_SPECIFICATIONS: "Invalid product specifications provided",
  INVALID_WEIGHT: "Invalid weight value",
  INVALID_PURITY: "Invalid purity value",
  MISSING_PRICING_DATA: "Missing pricing data for lookup"
} as const;

// ============================================================================
// ERROR HANDLING
// ============================================================================

class MetalCostCalculationError extends Error {
  constructor(
    message: string, 
    public code: string, 
    public details?: any
  ) {
    super(message);
    this.name = 'MetalCostCalculationError';
  }
}

function createErrorResult(
  supplier: string, 
  errors: string[], 
  method: CalculationResult['calculationMethod'],
  details: Record<string, any> = {}
): CalculationResult {
  return {
    supplier,
    metalCost: null,
    calculationMethod: method,
    details,
    errors,
    isSuccess: false
  };
}

function createSuccessResult(
  supplier: string,
  metalCost: number,
  method: CalculationResult['calculationMethod'],
  details: Record<string, any> = {},
  warnings: string[] = []
): CalculationResult {
  return {
    supplier,
    metalCost,
    calculationMethod: method,
    details,
    errors: warnings,
    isSuccess: true
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function validateSpecifications(specs: EnrichProductSpecificationsOutput): string[] {
  const errors: string[] = [];
  
  if (!specs || typeof specs !== 'object') {
    errors.push('Product specifications must be an object');
    return errors;
  }
  
  if (!specs.metal_purity || typeof specs.metal_purity !== 'string') {
    errors.push('Metal purity is required and must be a string');
  }
  
  if (!specs.metal_weight) {
    errors.push('Metal weight is required');
  } else {
    const weight = parseFloat(String(specs.metal_weight));
    if (isNaN(weight) || weight <= 0) {
      errors.push('Metal weight must be a valid positive number');
    }
  }
  
  return errors;
}

function processSpecifications(specs: EnrichProductSpecificationsOutput): ProcessedSpecifications | null {
  const validationErrors = validateSpecifications(specs);
  if (validationErrors.length > 0) {
    return null;
  }

  const weight = parseFloat(String(specs.metal_weight));
  
  return {
    metal_purity: specs.metal_purity.trim(),
    metal_weight: weight
  };
}

function validateLeesData(data: SupplierData): string[] {
  const errors: string[] = [];
  const mfgPart = data["MFG & Part #"]?.trim() || "";
  const part2 = data["Part #2"]?.trim() || "";
  
  if (!mfgPart && !part2) {
    errors.push(`${ERROR_TYPES.MISSING_ATTRIBUTE}: Both MFG & Part # and Part #2 are missing.`);
  }
  
  return errors;
}

function validateSupplierData(data: SupplierData): string[] {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push(ERROR_TYPES.INVALID_SUPPLIER_DATA);
    return errors;
  }
  
  return errors;
}

// ============================================================================
// LOOKUP FUNCTIONS
// ============================================================================

/**
 * Safely access LEES_SUPPLIER_DATA with error handling
 */
function getLeesSupplierDataSafe(): LeesDataItem[] {
  try {
    const data = getLeesSupplierData();
    if (!data || !Array.isArray(data)) {
      console.warn('LEES_SUPPLIER_DATA is not available or not an array');
      return [];
    }
    return data as LeesDataItem[];
  } catch (error) {
    console.error('Error accessing LEES_SUPPLIER_DATA:', error);
    return [];
  }
}

/**
 * Looks up an item in Lee's supplier data using a 3-step algorithm.
 * @param partNumber The part number to look up.
 * @returns An object with price, match type, processed string, search attempts, and potential errors.
 */
function lookupLeesItem(partNumber: string): LookupResult {
  if (!partNumber || typeof partNumber !== 'string' || partNumber.trim() === '') {
    return { 
      price: null, 
      matchType: 'not_provided', 
      processed: '', 
      searchAttempts: 0 
    };
  }

  const leesData = getLeesSupplierDataSafe();
  if (leesData.length === 0) {
    return {
      price: null,
      matchType: 'no_match',
      processed: partNumber.trim(),
      searchAttempts: 0,
      error: ERROR_TYPES.MISSING_PRICING_DATA
    };
  }

  const searchItem = partNumber.trim();
  let attempts = 0;

  // Step 1: Exact Match
  attempts++;
  let match = leesData.find(item => 
    item["Item Number"] && item["Item Number"].trim() === searchItem
  );
  
  if (match && typeof match["Per Piece"] === 'number') {
    return { 
      price: match["Per Piece"], 
      matchType: 'exact', 
      processed: searchItem, 
      searchAttempts: attempts 
    };
  }

  // Step 2: Progressive Truncation
  let truncatedSearch = searchItem;
  while (truncatedSearch.includes('-')) {
    truncatedSearch = truncatedSearch.substring(0, truncatedSearch.lastIndexOf('-'));
    if (truncatedSearch.trim()) {
      attempts++;
      match = leesData.find(item => 
        item["Item Number"] && item["Item Number"].trim() === truncatedSearch
      );
      
      if (match && typeof match["Per Piece"] === 'number') {
        return { 
          price: match["Per Piece"], 
          matchType: 'progressive', 
          processed: truncatedSearch, 
          searchAttempts: attempts 
        };
      }
    }
  }

  // Step 3: Substring Match
  attempts++;
  const substringMatches = leesData.filter(item => 
    item["Item Number"] && 
    item["Item Number"].includes(searchItem) &&
    typeof item["Per Piece"] === 'number'
  );
  
  if (substringMatches.length === 1) {
    return { 
      price: substringMatches[0]["Per Piece"], 
      matchType: 'substring', 
      processed: searchItem, 
      searchAttempts: attempts 
    };
  }
  
  if (substringMatches.length > 1) {
    const errorMsg = `${ERROR_TYPES.MULTIPLE_MATCHES} for part: ${searchItem}`;
    return { 
      price: null, 
      matchType: 'multiple_matches', 
      processed: searchItem, 
      searchAttempts: attempts, 
      error: errorMsg 
    };
  }

  const notFoundMsg = `${ERROR_TYPES.NO_MATCH_FOUND} for part: ${searchItem}`;
  return { 
    price: null, 
    matchType: 'no_match', 
    processed: searchItem, 
    searchAttempts: attempts, 
    error: notFoundMsg 
  };
}

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Lee's Manufacturing specific cost calculation.
 */
function calculateLeesCost(data: SupplierData): CalculationResult {
  const dataValidationErrors = validateSupplierData(data);
  if (dataValidationErrors.length > 0) {
    return createErrorResult(
      "Lee's Manufacturing",
      dataValidationErrors,
      'supplier_specific'
    );
  }

  const validationErrors = validateLeesData(data);
  if (validationErrors.length > 0) {
    return createErrorResult(
      "Lee's Manufacturing",
      validationErrors,
      'supplier_specific'
    );
  }

  const mfgPart = data["MFG & Part #"]?.trim() || "";
  const part2 = data["Part #2"]?.trim() || "";
  const errors: string[] = [];
  const details: Record<string, any> = {};

  // Lookup MFG & Part #
  const mfgPartResult = lookupLeesItem(mfgPart);
  details["mfg_and_part"] = {
    original: mfgPart,
    processed: mfgPartResult.processed,
    matchType: mfgPartResult.matchType,
    perPiecePrice: mfgPartResult.price,
    searchAttempts: mfgPartResult.searchAttempts
  } as LookupDetails;
  
  if (mfgPartResult.error) {
    errors.push(`MFG & Part #: ${mfgPartResult.error}`);
  }

  // Lookup Part #2
  const part2Result = lookupLeesItem(part2);
  details["part_2"] = {
    original: part2,
    processed: part2Result.processed,
    matchType: part2Result.matchType,
    perPiecePrice: part2Result.price,
    searchAttempts: part2Result.searchAttempts
  } as LookupDetails;
  
  if (part2Result.error) {
    errors.push(`Part #2: ${part2Result.error}`);
  }

  // Calculate total cost
  let metalCost: number | null = null;
  
  const mfgPrice = typeof mfgPartResult.price === 'number' ? mfgPartResult.price : 0;
  const part2Price = typeof part2Result.price === 'number' ? part2Result.price : 0;
  
  // At least one part must have a valid price
  if (mfgPartResult.price !== null || part2Result.price !== null) {
    metalCost = mfgPrice + part2Price;
    
    details.calculation = {
      mfgPartPrice: mfgPrice,
      part2Price: part2Price,
      totalCost: metalCost
    };

    if (metalCost >= 0) { // Allow zero cost
      return createSuccessResult(
        "Lee's Manufacturing",
        metalCost,
        'supplier_specific',
        details,
        errors
      );
    }
  }

  // If we reach here, calculation failed
  if (errors.length === 0) {
    errors.push(ERROR_TYPES.CALCULATION_ERROR);
  }

  return createErrorResult(
    "Lee's Manufacturing",
    errors,
    'supplier_specific',
    details
  );
}

/**
 * Default metal cost calculation using standard rates.
 */
function calculateStandardCost(
  data: SupplierData, 
  specifications: EnrichProductSpecificationsOutput, 
  method: 'standard' | 'standard_fallback' = 'standard'
): CalculationResult {
  const supplierName = data['Supplier Name'] || "Standard Calculation";
  
  const dataValidationErrors = validateSupplierData(data);
  if (dataValidationErrors.length > 0) {
    return createErrorResult(supplierName, dataValidationErrors, method);
  }

  const processedSpecs = processSpecifications(specifications);
  if (!processedSpecs) {
    const specValidationErrors = validateSpecifications(specifications);
    return createErrorResult(supplierName, specValidationErrors, method);
  }

  const { metal_purity: purity, metal_weight: weight } = processedSpecs;
  const errors: string[] = [];
  let metalCost: number | null = null;
  let applicableRate: number | string = "N/A";
  let normalizedPurityKey: string | null = null;

  // Normalize purity key - more robust matching
  const purityLower = purity.toLowerCase().replace(/\s+/g, '');
  
  if (purityLower.includes('10k') || purityLower.includes('10kt')) {
    normalizedPurityKey = '10k';
  } else if (purityLower.includes('14k') || purityLower.includes('14kt')) {
    normalizedPurityKey = '14k';
  } else if (purityLower.includes('18k') || purityLower.includes('18kt')) {
    normalizedPurityKey = '18k';
  } else if (purityLower.includes('950') || purityLower.includes('platinum')) {
    normalizedPurityKey = '950';
  }

  // Prefer Google Sheets metal rates if available
  const dynamicRates = getMetalRates();
  if (normalizedPurityKey) {
    const dynamicKey = normalizedPurityKey;
    if (dynamicRates && typeof dynamicRates[dynamicKey] === 'number') {
      applicableRate = dynamicRates[dynamicKey];
    } else if (STANDARD_METAL_RATES[normalizedPurityKey]) {
      applicableRate = STANDARD_METAL_RATES[normalizedPurityKey];
    } else {
      errors.push(`No metal rate found for metal purity: ${purity}`);
    }
  }

  // Calculate cost
  if (typeof applicableRate === 'number' && weight > 0) {
    metalCost = applicableRate * weight;
  } else if (typeof applicableRate !== 'number') {
    errors.push(ERROR_TYPES.INVALID_PURITY);
  }

  const details = {
    purity: {
      original: purity,
      processed: normalizedPurityKey || 'N/A',
      matchType: 'standard_rate',
      perPiecePrice: applicableRate
    } as PurityDetails,
    weight: {
      original: String(specifications.metal_weight),
      processed: weight,
      matchType: 'parsed_float',
      perPiecePrice: 'N/A'
    } as WeightDetails,
    calculation: {
      rate: applicableRate,
      weight: weight,
      totalCost: metalCost
    }
  };

  if (metalCost !== null && metalCost >= 0) {
    return createSuccessResult(
      supplierName,
      metalCost,
      method,
      details,
      errors
    );
  }

  return createErrorResult(
    supplierName,
    errors.length > 0 ? errors : [ERROR_TYPES.CALCULATION_ERROR],
    method,
    details
  );
}

// ============================================================================
// SUPPLIER HANDLERS
// ============================================================================

const supplierCostHandlers: Record<string, (data: SupplierData, specs: EnrichProductSpecificationsOutput) => CalculationResult> = {
  "lee's manufacturing": (data, specs) => calculateLeesCost(data),
  "lees manufacturing": (data, specs) => calculateLeesCost(data),
  "lee's": (data, specs) => calculateLeesCost(data),
  "lees": (data, specs) => calculateLeesCost(data)
};

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Main function to calculate metal cost.
 * Tries supplier-specific logic first, then falls back to standard calculation.
 */
export function calculateMetalCost(
  data: SupplierData, 
  specifications: EnrichProductSpecificationsOutput
): CalculationResult {
  try {
    // Validate inputs
    if (!data || typeof data !== 'object') {
      return createErrorResult(
        "Unknown",
        [ERROR_TYPES.INVALID_SUPPLIER_DATA],
        'standard'
      );
    }

    if (!specifications || typeof specifications !== 'object') {
      return createErrorResult(
        data['Supplier Name'] || "Unknown",
        [ERROR_TYPES.INVALID_SPECIFICATIONS],
        'standard'
      );
    }

    const supplier = (data['Supplier Name'] || '').toLowerCase().trim();

    // Try supplier-specific handler first
    if (supplier && supplierCostHandlers[supplier]) {
      const handler = supplierCostHandlers[supplier];
      const result = handler(data, specifications);
      
      // If supplier-specific logic fails, try standard fallback
      if (!result.isSuccess) {
        const specValidationErrors = validateSpecifications(specifications);
        if (specValidationErrors.length === 0) {
          const fallbackResult = calculateStandardCost(data, specifications, 'standard_fallback');
          
          if (fallbackResult.isSuccess) {
            // Combine information from both attempts
            fallbackResult.errors = [
              `Supplier-specific calculation failed: ${result.errors.join(', ')}`,
              'Used standard calculation as fallback',
              ...fallbackResult.errors
            ];
            
            // Preserve supplier-specific lookup details alongside fallback details
            fallbackResult.details = { 
              supplier_attempt: result.details,
              fallback_calculation: fallbackResult.details 
            };
            
            return fallbackResult;
          }
        }
      }
      
      return result;
    }

    // Use standard calculation for unknown suppliers or when no supplier specified
    return calculateStandardCost(data, specifications, 'standard');

  } catch (error) {
    return createErrorResult(
      data?.['Supplier Name'] || "Unknown",
      [`Unexpected error: ${error instanceof Error ? error.message : String(error)}`],
      'standard'
    );
  }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export {
  type SupplierData,
  type CalculationResult,
  type LookupResult,
  type LookupDetails,
  type PurityDetails,
  type WeightDetails,
  type ProcessedSpecifications,
  MetalCostCalculationError,
  STANDARD_METAL_RATES,
  ERROR_TYPES,
  validateSpecifications,
  lookupLeesItem,
  validateSupplierData,
  processSpecifications
};
