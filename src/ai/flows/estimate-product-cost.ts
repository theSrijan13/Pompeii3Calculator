// This flow orchestrates the cost estimation process.
'use server';


import {ai} from '@/ai/genkit';
import {z} from 'zod';
import {calculateMetalCost} from '@/services/metal-cost-calculator';
import {calculateLaborCost} from '@/services/labor-cost-calculator';
import {EnrichProductSpecificationsOutput} from './enrich-product-specifications';
import {calculateDiamondBill} from '@/services/diamond-cost-calculator';
import { calculateGemstoneBill } from '@/services/gemstone-cost-calculator';
import { preloadPricingFromGoogleSheets } from '@/services/pricing-source';



const EstimateProductCostInputSchema = z.object({
  productTitle: z.string().describe('The title of the product.'),
  productDescription: z.string().describe('The description of the product.'),
  productSpecifications: z.custom<EnrichProductSpecificationsOutput>().describe('The AI-enriched specifications of the product as a JSON object.'),
  rawData: z.record(z.any()).describe('The raw product data from ChannelAdvisor.'),
});


export type EstimateProductCostInput = z.infer<typeof EstimateProductCostInputSchema>;


const BillDetailSchema = z.object({
    item_number: z.number(),
    type: z.string(),
    shape: z.string().optional(),
    size: z.string().optional(),
    carat_value: z.string().optional(),
    quantity: z.number(),
    unit_price: z.number(),
    total_price: z.number(),
    note: z.string().optional(),
});


const EstimateProductCostOutputSchema = z.object({
  materialCost: z.union([z.number(), z.string()]).describe('The estimated cost of materials (metal). Can be a number or "ERROR".'),
  laborCost: z.number().describe('The estimated labor cost for manufacturing the product.'),
  diamondCost: z.number().describe('The estimated cost of diamonds used in the product.'),
  gemstoneCost: z.number().describe('The estimated cost of gemstones used in the product.'),
  totalCost: z.union([z.number(), z.string()]).describe('The estimated total cost to manufacture the product. Can be "ERROR".'),
  costBreakdown: z.string().describe('A detailed breakdown of the cost estimation for labor and AI-inferred costs, including assumptions and calculations.'),
  metalCostDetails: z.record(z.any()).optional().describe('Detailed breakdown of the metal cost calculation.'),
  laborCostDetails: z.record(z.any()).optional().describe('Detailed breakdown of the labor cost calculation.'),
  diamondBillDetails: z.record(z.any()).optional().describe('Detailed breakdown of the diamond cost calculation.'),
  gemstoneBillDetails: z.record(z.any()).optional().describe('Detailed breakdown of the gemstone cost calculation.'),
  validationError: z.string().optional().describe('An error message if validation fails.'),
});


export type EstimateProductCostOutput = z.infer<typeof EstimateProductCostOutputSchema>;


export async function estimateProductCost(input: EstimateProductCostInput): Promise<EstimateProductCostOutput> {
  return estimateProductCostFlow(input);
}



// This flow no longer needs an AI prompt. It orchestrates calls to various calculation services.
const estimateProductCostFlow = ai.defineFlow(
  {
    name: 'estimateProductCostFlow',
    inputSchema: EstimateProductCostInputSchema,
    outputSchema: EstimateProductCostOutputSchema,
  },
  async ({ rawData, productSpecifications, productTitle, productDescription }) => {
    // Best-effort preload of pricing from Google Sheets (falls back silently)
    try { await preloadPricingFromGoogleSheets(); } catch {}
    
    // Create product data object for earring detection
    const productData = {
      Title: productTitle || rawData?.Title || '',
      Description: productDescription || rawData?.Description || '',
      Category: rawData?.Category || '',
      Type: rawData?.Type || '',
      Name: rawData?.Name || '',
      ...rawData // Include all raw data fields
    };
    
    // 1. Calculate individual costs
    const metalCostResult = calculateMetalCost(rawData, productSpecifications, productData);
    const laborCostResult = calculateLaborCost(productSpecifications);
    let diamondBillResult = calculateDiamondBill(rawData, productSpecifications);
    const gemstoneBillResult = calculateGemstoneBill(productSpecifications);


    const { isSuccess, metalCost } = metalCostResult;
    const materialCost = isSuccess ? metalCost : "ERROR";
    const { laborCost } = laborCostResult;
   
    let diamondCost = diamondBillResult?.billData?.total_bill || 0;
    const gemstoneCost = gemstoneBillResult.isSuccess ? 
        gemstoneBillResult.billData?.total_bill || 0 : 0;


    // 2. Total Carat Weight Validation
    const exactTotalCarat = parseFloat(rawData['Exact Carat Total Weight']);
    if (!isNaN(exactTotalCarat) && exactTotalCarat > 0) {
      let calculatedTotalCarat = 0;


      // Sum carats from diamonds
      if (diamondBillResult?.isSuccess && diamondBillResult.billData?.diamonds) {
        for (const diamond of diamondBillResult.billData.diamonds) {
          const { carat_per_unit: caratPerUnit = 0, quantity } = diamond;
          calculatedTotalCarat += caratPerUnit * quantity;
        }
      }


      // Sum carats from gemstones
       if (gemstoneBillResult?.isSuccess && gemstoneBillResult.billData?.gemstones) {
        for (const gemstone of gemstoneBillResult.billData.gemstones) {
           const { carat_per_unit: caratPerUnit = 0, quantity } = gemstone;
          calculatedTotalCarat += caratPerUnit * quantity;
        }
      }


      const lowerBound = exactTotalCarat * 0.80;
      const upperBound = exactTotalCarat * 1.20;
      const epsilon = 1e-9; // Small tolerance for floating point comparison


      // Only apply validation if calculated carats are significant
      if (calculatedTotalCarat > 0.001 && (calculatedTotalCarat < lowerBound - epsilon || calculatedTotalCarat > upperBound + epsilon)) {
        const validationError = `Weight Mismatch: Calculated total carat weight (${calculatedTotalCarat.toFixed(3)}ct) is outside the acceptable ±20% range of the Exact Carat Total Weight (${exactTotalCarat}ct).`;
        console.error(validationError);
        // Stop further processing and return an error state
        return {
          materialCost: "ERROR",
          laborCost: 0,
          diamondCost: 0,
          gemstoneCost: 0,
          totalCost: "ERROR",
          costBreakdown: `VALIDATION FAILED: ${validationError}`,
          validationError: validationError,
          metalCostDetails: metalCostResult,
          laborCostDetails: laborCostResult,
          diamondBillDetails: diamondBillResult?.billData || {},
          gemstoneBillDetails: gemstoneBillResult?.billData || {},
        };
      }
    }



    // 3. Calculate Total Cost
    let totalCost: number | "ERROR" = "ERROR";
    if (typeof materialCost === 'number' && typeof laborCost === 'number' && typeof diamondCost === 'number' && typeof gemstoneCost === 'number') {
        totalCost = materialCost + laborCost + diamondCost + gemstoneCost;
    } else {
        totalCost = "ERROR";
    }



    // 4. Assemble the cost breakdown string
    const costBreakdown = `
${laborCostResult.breakdown}
-----------------------------------
Diamond Bill Notes:
${diamondBillResult?.billData?.diamonds.map(d => ` - Diamond #${d.diamond_number}: ${d.note || 'Priced successfully.'}`).join('\n') || 'No diamond pricing notes.'}
${diamondBillResult?.warnings.map(w => ` - WARNING: ${w}`).join('\n') || ''}
${diamondBillResult?.errors.map(e => ` - ERROR: ${e}`).join('\n') || ''}
-----------------------------------
Gemstone Bill Notes:
${gemstoneBillResult?.billData?.gemstones.map(g => ` - Gemstone #${g.gemstone_number}: ${g.note || 'Priced successfully.'}`).join('\n') || 'No gemstone pricing notes.'}
${gemstoneBillResult?.warnings.map(w => ` - WARNING: ${w}`).join('\n') || ''}
${gemstoneBillResult?.errors.map(e => ` - ERROR: ${e}`).join('\n') || ''}
    `.trim();


    const finalResult = {
      materialCost,
      laborCost,
      diamondCost,
      gemstoneCost,
      totalCost,
      costBreakdown,
      metalCostDetails: metalCostResult,
      laborCostDetails: laborCostResult,
      diamondBillDetails: diamondBillResult?.billData || {},
      gemstoneBillDetails: gemstoneBillResult?.billData || {},
    };


    // Final validation to ensure the object matches the Zod schema before returning
    const validation = EstimateProductCostOutputSchema.safeParse(finalResult);
    if (!validation.success) {
      const flatError = validation.error.flatten();
      console.error("Final cost estimation object failed schema validation:", flatError);
     
      const errorMsg = JSON.stringify(flatError.fieldErrors);


      // Return an error state that still conforms to the schema
      return {
        materialCost: "ERROR",
        laborCost: 0,
        diamondCost: 0,
        gemstoneCost: 0,
        totalCost: "ERROR",
        costBreakdown: `INTERNAL SCHEMA ERROR: The final calculated object is invalid. Please check logs.`,
        validationError: `INTERNAL SCHEMA ERROR: ${errorMsg}`,
        metalCostDetails: finalResult.metalCostDetails,
        laborCostDetails: finalResult.laborCostDetails,
        diamondBillDetails: finalResult.diamondBillDetails,
        gemstoneBillDetails: finalResult.gemstoneBillDetails
      };
    }
   
    return validation.data;
  }
);
