import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProductSpecifications } from './product-specifications';
import { RawDataView } from './raw-data-view';

export function ResultsView({ result }: { result: any }) {
  const { product, cost, rawData } = result;

  return (
    <Card className="border-primary/20 shadow-lg hover:shadow-glow-primary/50 transition-shadow duration-300 w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-headline">{product.title}</CardTitle>
        <CardDescription>{product.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid grid-cols-1 gap-8 items-start">
            {rawData && <RawDataView rawData={rawData} images={product.images} title={product.title} imageHints={product.imageHints} />}
        </div>
        <div className="flex flex-col gap-8">
            <ProductSpecifications specifications={product.specifications} cost={cost} />
        </div>
      </CardContent>
    </Card>
  );
}
