export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  fetchAllFreshPricingData,
} from '@/services/pricing-source';

export async function GET() {
  try {
    // Fetch fresh data every time - no caching
    const freshData = await fetchAllFreshPricingData();

    return NextResponse.json({
      ok: true,
      fresh: true,
      timestamp: new Date().toISOString(),
      counts: {
        naturalDiamonds: Array.isArray(freshData.naturalDiamonds) ? freshData.naturalDiamonds.length : 0,
        labDiamonds: Array.isArray(freshData.labDiamonds) ? freshData.labDiamonds.length : 0,
        leesSupplier: Array.isArray(freshData.leesSupplier) ? freshData.leesSupplier.length : 0,
        gemstonesTypes: freshData.gemstones ? Object.keys(freshData.gemstones).length : 0,
        metalRates: freshData.metalRates ? Object.keys(freshData.metalRates).length : 0,
        laborConfigured: freshData.laborCosts ? 1 : 0,
      }
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}


