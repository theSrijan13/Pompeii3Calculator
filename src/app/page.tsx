import { SkuAnalyzer } from '@/components/sku-analyzer/sku-analyzer';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="w-full">
      <SkuAnalyzer />
    </div>
  );
}
