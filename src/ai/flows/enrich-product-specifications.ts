// This is a server-side file.
'use server';
/**
 * @fileOverview This file defines a Genkit flow for enriching product specifications
 * fetched from the ChannelAdvisor API using AI, based on predefined rules for each product category.
 *
 * @module ai/flows/enrich-product-specifications
 *
 * @typedef {object} EnrichProductSpecificationsInput - The input type for the enrichProductSpecifications function.
 * @property {string} category - The product category.
 * @property {object} specifications - The product specifications fetched from ChannelAdvisor API.
 *
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { CONVERSION_FACTOR } from '@/config';
import { getNaturalDiamondData, getLabDiamondData, preloadPricingFromGoogleSheets } from '@/services/pricing-source';

const EnrichProductSpecificationsInputSchema = z.object({
  productData: z.record(z.any()).describe('The full product data from ChannelAdvisor.'),
});
export type EnrichProductSpecificationsInput = z.infer<typeof EnrichProductSpecificationsInputSchema>;

const DiamondDetailSchema = z.object({
  diamondType: z.string(),
  size: z.number().optional(),
  quantity: z.number(),
  carat_value: z.string().nullable(),
  width: z.number().optional(),
  shape: z.string().optional(),
  lookupCode: z.string().optional().describe('The code to use for data sheet lookups, e.g., ND+6.5'),
});

const GemstoneDetailSchema = z.object({
  gemstoneType: z.string(),
  gemstoneShape: z.string(),
  gemstoneSize: z.string(),
  gemstoneCarat: z.number().nullable(),
  quantity: z.number(),
});

const VisualAnalysisSchema = z.object({
    diamond_count_match: z.boolean(),
    gemstone_count_match: z.boolean(),
    shape_consistency: z.string()
});

const EnrichProductSpecificationsOutputSchema = z.object({
  metal_purity: z.string(),
  metal_weight: z.string(),
  stone_used: z.string(),
  diamond_details: z.object({
    diamonds: z.array(DiamondDetailSchema),
    note: z.string().optional(),
  }).nullable(),
  gemstone_details: z.object({
    gemstones: z.array(GemstoneDetailSchema),
    note: z.string().optional(),
  }).nullable(),
  visual_analysis: VisualAnalysisSchema,
});
export type EnrichProductSpecificationsOutput = z.infer<typeof EnrichProductSpecificationsOutputSchema>;

export async function enrichProductSpecifications(
  input: EnrichProductSpecificationsInput
): Promise<EnrichProductSpecificationsOutput> {
  return enrichProductSpecificationsFlow(input);
}

const enrichProductSpecificationsPrompt = ai.definePrompt({
  name: 'enrichProductSpecificationsPrompt',
  input: {
    schema: z.object({
      data: z.record(z.any()),
      diamondPricing: z.record(z.any())
    }),
  },
  output: {
    schema: EnrichProductSpecificationsOutputSchema,
  },
  prompt: `You are a world-class expert in jewelry data extraction and normalization. Your primary task is to process raw product data into a structured JSON format, adhering to a strict hierarchy of data sources and applying complex parsing rules. Your output must be perfect and ready for machine processing.

## 1. Data Extraction Hierarchy (Strict Order)
1.  **Primary Source (Highest Priority)**: Process the 'Pick1' field. This field contains the most critical information.
2.  **Secondary Source**: Process the 'Pick2' field. This field often contains supplementary diamond details.
3.  **Tertiary Source**: Process the 'Pick 3' field.
4.  **Fallback Source (Lowest Priority)**: Only if the 'Pick' fields are empty or insufficient for a specific attribute, you MUST parse the 'Title' and 'Description' fields to fill in any missing details. **Do not use the fallback if the pick fields provide complete information.**
5.  **Exhaustive Extraction**: You must extract ALL diamond and gemstone information available across ALL 'Pick' fields. If multiple diamonds are described, create a separate entry for each in the output array.

## 2. Parsing Rules and Logic

### Rule 2.1: Pick1 Field ("Big One") Processing
-   **Purpose**: To extract primary stone details like quantity, size, and shape.
-   **Pattern Example**: "seven crores, three MM"
    -   **Logic**:
        -   Convert textual quantity ("seven") to a number (7).
        -   Extract size and unit ("three MM" -> "3MM").
        -   Infer shape and stone type from the overall product context if not explicitly stated.

### Rule 2.2: Pick2 Field ("Big Two") Processing & Lookup Code Normalization
-   **Purpose**: To extract lookup codes for diamonds. This is a critical step for pricing.
-   **Pattern Example**: "twelve plus 6.5"
    -   **Logic**:
        -   Extract quantity ("twelve" -> 12).
        -   Identify the number as a lookup code ("6.5").
        -   **CRITICAL**: You MUST normalize "plus" to a "+" sign. The final lookupCode MUST be in the format 'ND+6.5' or 'LD+6.5', depending on if the diamond is natural or lab-grown. Store this in the 'lookupCode' field.

### Rule 2.3: Special Diamond Notation (Zero Notations)
-   **Purpose**: To parse special "zero" notations into the correct 'lookupCode'.
-   **Action**: First, determine if the diamond is a Natural Diamond (ND) or Lab-Grown Diamond (LD) from the context. Then, apply the correct prefix.
-   **Formats to recognize**:
    -   "38+0" -> Should produce a lookupCode of 'ND+G0' or 'LD+G0'. The "38" is the quantity. The "+0" part maps directly to the "G0" in the productID.
    -   "plus 4/0" -> Should produce a lookupCode of 'ND+4/0' or 'LD+4/0'.
    -   "plus 0000" -> Should produce a lookupCode of 'ND+4/0' or 'LD+4/0'.
    -   "plus 3/0" -> Should produce a lookupCode of 'ND+3/0' or 'LD+3/0'.
    -   "plus 000" -> Should produce a lookupCode of 'ND+3/0' or 'LD+3/0'.
    -   "plus 2/0" -> Should produce a lookupCode of 'ND+2/0' or 'LD+2/0'.
    -    "plus 00" -> Should produce a lookupCode of 'ND+2/0' or 'LD+2/0'.
-   **Action**: When these patterns are found, you must generate the correct 'lookupCode' (including the ND/LD prefix) and extract the quantity.

### Rule 2.4: Standard Diamond Notation (from any field)
-   **Purpose**: To parse various common formats for diamond specifications.
-   **Formats to recognize**:
    -   'sz X QTY-CARAT' (e.g., 'sz 5 15-.33' -> Size: 5, Qty: 15, Carat: 0.33)
    -   'QTY+CARAT' (e.g., '2+5' -> Qty: 2, Carat: 5)
    -   'QTYx CARAT cut' (e.g., '1x 1/5 mq' -> Qty: 1, Carat: 0.2, Cut: mq)

### Rule 2.5: Carat Value Logic (Strict Priority)
1.  **Lookup Code First (HIGHEST PRIORITY)**: If a 'lookupCode' is extracted (e.g., 'ND+6.5' or 'LD+G0'), you MUST find its corresponding 'caratPerUnit' value from the provided Diamond Pricing Data. This value MUST be used for the 'carat_value' in the output. This rule overrides all other carat sources.
2.  **Primary Source**: If no 'lookupCode' is available, use carat values explicitly stated in 'Pick 1', 'Pick 2', or 'Pick 3'.
3.  **Mandatory Fallback**: If, and only if, NO carat information can be found via 'lookupCode' or in ANY of the 'Pick' fields, you MUST deterministically fetch the carat value from the 'Title' and 'Description' fields. This is not optional.
4.  **Calculation (Last Resort)**: Only if NO carat value can be found via the above methods, calculate it using: "Exact Carat Total Weight" - "Stone Carat".

### Rule 2.6: MM (Millimeter) Width Format
-   **Pattern**: "X.XX mm [shape]" (e.g., "6.92 mm round")
-   **Action**: Extract the numeric 'width' and the 'shape'. This is a physical dimension, not a carat weight.

### Rule 2.7: Gemstone Data
-   **Source Priority**: The extraction for gemstones follows the same strict hierarchy as diamonds. Prioritize 'Pick' fields first, and only fall back to 'Title'/'Description' if the necessary gemstone details (type, shape, size, carat) are absent from the Pick fields.

## 3. Output Requirements & Logic

-   **\`stone_used\`**: Set to "Yes" if \`Exact Carat Total Weight\` > 0 OR if any diamond or gemstone details are successfully extracted. Otherwise, set to "No".
-   **\`null\` values**: If \`stone_used\` is "No", the \`diamond_details\` and \`gemstone_details\` fields MUST be \`null\`.
-   **\`visual_analysis\`**: Perform a basic check. \`diamond_count_match\` should be true if the sum of extracted diamond quantities seems plausible based on the \`Number of Diamonds\` field, if available. \`gemstone_count_match\` is similar for gemstones. \`shape_consistency\` should summarize if all extracted shapes are consistent (e.g., "All Round").
-   **Clarity**: Do not confuse size (physical dimensions like MM), width, and carats (weight). They are distinct attributes.
-   **\`metal_weight\`**: Extract the metal weight. If it's not available, set it to "0". Do not attempt to calculate it. The calculation will be handled by a separate specialized service.

## 4. Diamond Pricing Data (for carat lookup)
Here is the data for looking up carat values from a 'lookupCode'.
{{{json diamondPricing}}}

## 5. Expected JSON Output Format
Your final output MUST strictly adhere to this Zod schema. Do NOT add extra text, explanations, or markdown.

\`\`\`json
{
  "metal_purity": "string",
  "metal_weight": "string",
  "stone_used": "Yes" | "No",
  "diamond_details": {
    "diamonds": [
      {
        "diamondType": "string",
        "size": number (optional),
        "quantity": number,
        "carat_value": "string" (nullable),
        "lookupCode": "string" (optional, e.g., "ND+6.5")
      },
      {
        "diamondType": "string",
        "width": number,
        "shape": "string",
        "quantity": number
      }
    ],
    "note": "string (optional)"
  } | null,
  "gemstone_details": {
    "gemstones": [
      {
        "gemstoneType": "string",
        "gemstoneShape": "string",
        "gemstoneSize": "string",
        "gemstoneCarat": number (nullable),
        "quantity": number
      }
    ],
    "note": "string (optional)"
  } | null,
  "visual_analysis": {
    "diamond_count_match": boolean,
    "gemstone_count_match": boolean,
    "shape_consistency": "string"
  }
}
\`\`\`

## Input Product Data
Here is the raw data to process:
{{{json data}}}`,
  config: {
    temperature: 0.0,
    topK: 1,
    topP: 0.1,
    maxOutputTokens: 8192,
  },
});

const enrichProductSpecificationsFlow = ai.defineFlow(
  {
    name: 'enrichProductSpecificationsFlow',
    inputSchema: EnrichProductSpecificationsInputSchema,
    outputSchema: EnrichProductSpecificationsOutputSchema,
  },
  async ({ productData }) => {
    // Validate input data
    if (!productData || typeof productData !== 'object') {
      throw new Error("Product data is required and must be a valid object.");
    }

    // Ensure pricing is preloaded from Google Sheets; silently falls back to static
    try { await preloadPricingFromGoogleSheets(); } catch {}
    const allDiamondData = [...(getNaturalDiamondData() as any[]), ...(getLabDiamondData() as any[])];
    const diamondPricingData = allDiamondData.reduce((acc, item) => {
        if (item.productId && item.caratPerUnit) {
            acc[item.productId] = { caratPerUnit: item.caratPerUnit };
        }
        return acc;
    }, {} as Record<string, { caratPerUnit: number }>);


    const { output } = await enrichProductSpecificationsPrompt({ 
      data: productData,
      diamondPricing: diamondPricingData
    });

    if (!output) {
      console.warn("AI failed to return structured data, using default structure");
      // Provide a default structure when AI fails
      const defaultOutput = {
        metal_purity: productData.MetalType || productData.Metal || "Unknown",
        metal_weight: productData.Weight || productData.MetalWeight || "0",
        stone_used: productData.StoneType || productData.Stone || "None",
        diamond_details: null,
        gemstone_details: null,
        visual_analysis: {
          diamond_count_match: false,
          gemstone_count_match: false,
          shape_consistency: "Unable to analyze - AI processing failed"
        }
      };
      return defaultOutput;
    }
    
    // Validate the JSON structure immediately after receiving it from the AI.
    const validation = EnrichProductSpecificationsOutputSchema.safeParse(output);
    if (!validation.success) {
      console.error("Final JSON structure from AI is invalid:", validation.error);
      throw new Error("AI returned JSON with incorrect structure.");
    }

    console.log("Final JSON structure from AI validated. Returning result.");
    return validation.data;
  }
);
