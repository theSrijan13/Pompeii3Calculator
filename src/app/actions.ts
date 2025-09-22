// This is a server-side file.
'use server';

import { z } from 'zod';
import { enrichProductSpecifications } from '@/ai/flows/enrich-product-specifications';
import { estimateProductCost } from '@/ai/flows/estimate-product-cost';
import { fetchProductFromChannelAdvisor } from '@/services/channeladvisor';
import { fetchAllFreshPricingData, updateCacheWithFreshData } from '@/services/pricing-source';

const actionSchema = z.object({ sku: z.string().min(1, "SKU is required") });

function flattenProductData(product: any) {
  if (!product || typeof product !== 'object') return null;

  const flattened: Record<string, any> = {};

  // Flatten basic info
  if (product.basic) {
    for (const [key, value] of Object.entries(product.basic)) {
      flattened[key] = value;
    }
  }

  // Flatten attributes
  if (product.attributes && Array.isArray(product.attributes)) {
    product.attributes.forEach((attr: any) => {
      flattened[attr.Name] = attr.Value;
    });
  }
  
  // Flatten labels
  if (product.labels && Array.isArray(product.labels)) {
    product.labels.forEach((label: any) => {
      flattened[label.Name] = true;
    });
  }

  // Flatten images
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach((img: any, index: number) => {
        if(img.PlacementName === 'Item Photo') flattened['ITEMIMAGEURL1'] = img.Url;
        if(img.PlacementName === 'Item Photo 2') flattened['ITEMIMAGEURL2'] = img.Url;
        if(img.PlacementName === 'Item Photo 3') flattened['ITEMIMAGEURL3'] = img.Url;
    });
  }

  // Ensure consistent Supplier Name key
  if (flattened.SupplierName && !flattened['Supplier Name']) {
    flattened['Supplier Name'] = flattened.SupplierName;
  } else if (flattened.Supplier && !flattened['Supplier Name']) {
    flattened['Supplier Name'] = flattened.Supplier;
  }


  // Return null if flattened object is empty (no useful data extracted)
  return Object.keys(flattened).length > 0 ? flattened : null;
}


export async function getCostEstimation(prevState: any, formData: FormData) {
  const validatedFields = actionSchema.safeParse({ sku: formData.get('sku') });
  
  if (!validatedFields.success) {
    return { error: 'Invalid SKU provided. Please enter a valid SKU.' };
  }
  
  const { sku } = validatedFields.data;

  try {
    // Fetch fresh pricing data for this request
    console.log('Fetching fresh pricing data for request...');
    const freshPricingData = await fetchAllFreshPricingData();
    updateCacheWithFreshData(freshPricingData);
    console.log('Fresh pricing data loaded successfully');

    const rawProductData = await fetchProductFromChannelAdvisor(sku);
    if (!rawProductData) {
      return { error: `Product with SKU '${sku}' not found.` };
    }

    const specifications = flattenProductData(rawProductData);

    if (!specifications) {
      return { error: `Failed to process product data for SKU '${sku}'. Product data may be incomplete.` };
    }

    // Step 1: Enrich product specifications
    let enriched;
    try {
      enriched = await enrichProductSpecifications({
        productData: specifications,
      });
    } catch (error) {
      console.warn("enrichProductSpecifications failed, using fallback data:", error instanceof Error ? error.message : String(error));
      // Provide a fallback structure when enrichment fails
      enriched = {
        metal_purity: specifications.MetalType || specifications.Metal || "14K",
        metal_weight: specifications.Weight || specifications.MetalWeight || "1.0",
        stone_used: specifications.StoneType || specifications.Stone || "Diamond",
        diamond_details: specifications.DiamondCount ? {
          diamonds: [{
            diamondType: "Natural",
            quantity: parseInt(specifications.DiamondCount) || 1,
            carat_value: specifications.DiamondWeight || "0.1",
          }],
          note: "Fallback data due to AI enrichment failure"
        } : null,
        gemstone_details: null,
        visual_analysis: {
          diamond_count_match: false,
          gemstone_count_match: false,
          shape_consistency: "Unable to analyze - enrichment failed"
        }
      };
    }

    // Step 2: Estimate cost based on enriched data
    const cost = await estimateProductCost({
      productTitle: rawProductData.basic.Title,
      productDescription: rawProductData.basic.Description,
      productSpecifications: enriched, // Pass the object directly
      rawData: specifications,
    });
    
    const finalProduct = {
      sku: rawProductData.basic.Sku,
      title: rawProductData.basic.Title,
      description: rawProductData.basic.Description,
      images: rawProductData.images.map((img: any) => img.Url),
      imageHints: rawProductData.images.map(() => 'jewelry product'),
      specifications: enriched,
      category: rawProductData.basic.Classification
    };

    // Success: return both product and cost data
    return {
      data: {
        product: finalProduct,
        cost,
        rawData: specifications
      }
    };

  } catch (e: unknown) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { error: `An unexpected error occurred: ${errorMessage}` };
  }
}
