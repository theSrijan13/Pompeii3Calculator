/**
 * Service for calculating labor costs based on the number of stones.
 */
import { EnrichProductSpecificationsOutput } from '@/ai/flows/enrich-product-specifications';
import { getLaborCosts } from '@/services/pricing-source';

const DEFAULT_COST_PER_STONE = 1;
const DEFAULT_BASE_LABOR_COST = 20;

type LaborCalculationResult = {
  laborCost: number;
  totalStones: number;
  diamondCount: number;
  gemstoneCount: number;
  costPerStone: number;
  baseLaborCost: number;
  breakdown: string;
};

/**
 * Calculates the total labor cost based on the number of diamonds and gemstones.
 * @param specifications - The AI-enriched product specifications.
 * @returns {LaborCalculationResult} - An object containing the cost and breakdown.
 */
export function calculateLaborCost(
  specifications: EnrichProductSpecificationsOutput
): LaborCalculationResult {
  let diamondCount = 0;
  if (specifications?.diamond_details?.diamonds && Array.isArray(specifications.diamond_details.diamonds)) {
    diamondCount = specifications.diamond_details.diamonds.reduce(
      (sum, diamond) => sum + (Number(diamond.quantity) || 0),
      0
    );
  }

  let gemstoneCount = 0;
  if (specifications?.gemstone_details?.gemstones && Array.isArray(specifications.gemstone_details.gemstones)) {
    gemstoneCount = specifications.gemstone_details.gemstones.reduce(
      (sum, gemstone) => sum + (Number(gemstone.quantity) || 0),
      0
    );
  }

  const dynamic = getLaborCosts();
  const costPerStone = dynamic?.settingCostPerStone ?? DEFAULT_COST_PER_STONE;
  const baseLabor = dynamic?.fixedLaborCost ?? DEFAULT_BASE_LABOR_COST;

  const totalStones = diamondCount + gemstoneCount;
  const stoneSettingCost = totalStones * costPerStone;
  // Labor cost is applicable even if there are no stones (base cost for manufacturing)
  const laborCost = stoneSettingCost + baseLabor;

  const breakdown = `Labor Cost Calculation:
-- Total Diamonds: ${diamondCount}
-- Total Gemstones: ${gemstoneCount}
-- Total Stones: ${totalStones}
-- Setting Cost per Stone: $${costPerStone.toFixed(2)}
-- Total Stone Setting Cost: ${totalStones} * $${costPerStone.toFixed(2)} = $${stoneSettingCost.toFixed(2)}
-- Base Labor Cost: $${baseLabor.toFixed(2)}
-- Total Labor Cost: $${stoneSettingCost.toFixed(2)} + $${baseLabor.toFixed(2)} = $${laborCost.toFixed(2)}`;

  return {
    laborCost,
    totalStones,
    diamondCount,
    gemstoneCount,
    costPerStone: costPerStone,
    baseLaborCost: baseLabor,
    breakdown,
  };
}
