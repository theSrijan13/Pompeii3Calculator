import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import { Diamond, DollarSign, Gem, Hammer, List, Wrench } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const formatCurrency = (amount: number | string | null | undefined) => {
  if (typeof amount === 'string') return amount;
  if (typeof amount !== 'number' || isNaN(amount)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const LeesManufacturingDetails = ({ details }: { details: any }) => {
    const mfgPart = details.mfg_and_part || {};
    const part2 = details.part_2 || {};
    
    const mfgPrice = mfgPart.perPiecePrice || 0;
    const part2Price = part2.perPiecePrice || 0;
    const total = mfgPrice + part2Price;

    return (
        <div className="space-y-4 text-sm font-mono">
            <h4 className="font-semibold text-foreground mb-2 text-center border-b pb-1">Lee's Manufacturing Details</h4>

            {/* MFG & Part # */}
            <div className="bg-secondary/30 p-3 rounded-lg border">
                <div className="flex justify-between items-center font-semibold">
                    <span>MFG & Part #: {mfgPart.original || 'N/A'}</span>
                    <span>{formatCurrency(mfgPart.perPiecePrice)}</span>
                </div>
                <div className="pl-4 mt-1 space-y-1 text-muted-foreground text-xs">
                    <p>&#x21B3; Match: {mfgPart.processed} ({mfgPart.matchType})</p>
                    <p>&#x21B3; Search attempts: {mfgPart.searchAttempts}</p>
                </div>
            </div>

             {/* Part #2 */}
             <div className="bg-secondary/30 p-3 rounded-lg border">
                <div className="flex justify-between items-center font-semibold">
                    <span>Part #2: {part2.original || 'N/A'}</span>
                    <span>{formatCurrency(part2.perPiecePrice)}</span>
                </div>
                <div className="pl-4 mt-1 space-y-1 text-muted-foreground text-xs">
                    <p>&#x21B3; Match: {part2.processed} ({part2.matchType})</p>
                    <p>&#x21B3; Search attempts: {part2.searchAttempts}</p>
                </div>
            </div>
            
            {/* Calculation Summary */}
            <div className="pt-2 font-semibold">
                <p>Calculation: Lee's full success: MFG ({formatCurrency(mfgPrice)}) + Part2 ({formatCurrency(part2Price)}) = {formatCurrency(total)}</p>
            </div>
        </div>
    );
};


const StandardMetalDetails = ({ details }: { details: any }) => {
    return (
        <div className="space-y-4 text-sm">
            {details.purity && (
                 <div className="p-3 bg-secondary/50 rounded-lg border">
                    <h4 className="font-semibold text-foreground mb-2">Purity Details</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="text-muted-foreground">Original Value:</div>
                        <div className="font-mono break-all">{details.purity.original || 'N/A'}</div>

                        <div className="text-muted-foreground">Processed Value:</div>
                        <div className="font-mono break-all">{details.purity.processed || 'N/A'}</div>

                        <div className="text-muted-foreground">Match Type:</div>
                        <div className="capitalize">{details.purity.matchType?.replace(/_/g, ' ') || 'N/A'}</div>

                        <div className="text-muted-foreground">Rate:</div>
                        <div>{formatCurrency(details.purity.perPiecePrice)} / gram</div>
                    </div>
                </div>
            )}
             {details.weight && (
                 <div className="p-3 bg-secondary/50 rounded-lg border">
                    <h4 className="font-semibold text-foreground mb-2">Weight Details</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="text-muted-foreground">Original Value:</div>
                        <div className="font-mono break-all">{details.weight.original || 'N/A'}</div>

                        <div className="text-muted-foreground">Processed Value:</div>
                        <div className="font-mono break-all">{details.weight.processed}g</div>
                    </div>
                </div>
            )}
        </div>
    );
};


const MetalCostDetails = ({ details }: { details: any }) => {
    if (!details) return null;

    const renderDetails = () => {
        if (details.calculationMethod === 'supplier_specific') {
            return <LeesManufacturingDetails details={details.details} />;
        }
        if (details.calculationMethod === 'standard' || details.calculationMethod === 'standard_fallback') {
            const standardDetails = details.calculationMethod === 'standard_fallback' 
                ? details.details?.fallback_calculation 
                : details.details;
            return <StandardMetalDetails details={standardDetails} />;
        }
        return <p className="text-sm text-muted-foreground">Details not available.</p>;
    }

    return (
      <div className="space-y-4 text-sm">
        <p>
          <span className="font-semibold text-muted-foreground">Supplier:</span> {details.supplier}
        </p>
        <p>
          <span className="font-semibold text-muted-foreground">Calculation Method:</span>{' '}
          <span className="capitalize bg-muted/50 px-2 py-1 rounded-md">{details.calculationMethod.replace(/_/g, ' ')}</span>
        </p>

        {renderDetails()}

        {details.errors && details.errors.length > 0 && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            <h4 className="font-semibold mb-2">Calculation Notes & Errors</h4>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono">
              {details.errors.map((error: string, index: number) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

const LaborCostDetails = ({ details }: { details: any }) => {
    if (!details) return null;

    return (
        <div className="space-y-4 text-sm">
             <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 bg-secondary/50 rounded-lg border">
                <div className="text-muted-foreground">Total Diamonds:</div>
                <div className="font-mono">{details.diamondCount}</div>
                <div className="text-muted-foreground">Total Gemstones:</div>
                <div className="font-mono">{details.gemstoneCount}</div>
                <div className="text-muted-foreground font-semibold">Total Stones:</div>
                <div className="font-mono font-semibold">{details.totalStones}</div>
                <div className="text-muted-foreground">Cost per Stone:</div>
                <div className="font-mono">{formatCurrency(details.costPerStone)}</div>
                 <div className="text-muted-foreground">Base Labor Cost:</div>
                <div className="font-mono">{formatCurrency(details.baseLaborCost)}</div>
            </div>
            <Textarea
                readOnly
                value={details.breakdown}
                rows={8}
                className="font-mono text-xs bg-background border-border w-full"
            />
        </div>
    );
};

const DiamondBillDetails = ({ details }: { details: any }) => {
    if (!details || !details.diamonds || details.diamonds.length === 0) return <p className="text-sm text-muted-foreground">No diamond details available.</p>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Carat</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="min-w-[200px]">Note</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {details.diamonds.map((item: any) => (
                    <TableRow key={item.diamond_number}>
                        <TableCell>{item.diamond_number}</TableCell>
                        <TableCell>{item.diamondType}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.carat_value}</TableCell>
                        <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell>{formatCurrency(item.total_price)}</TableCell>
                        <TableCell className="text-xs">{item.note}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

const GemstoneBillDetails = ({ details }: { details: any }) => {
    if (!details || !details.gemstones || details.gemstones.length === 0) return <p className="text-sm text-muted-foreground">No gemstone details available.</p>;

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Shape</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Note</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {details.gemstones.map((item: any) => (
                    <TableRow key={item.gemstone_number}>
                        <TableCell>{item.gemstone_number}</TableCell>
                        <TableCell>{item.gemstone}</TableCell>
                        <TableCell>{item.shape}</TableCell>
                        <TableCell>{item.size}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell>{formatCurrency(item.total_price)}</TableCell>
                        <TableCell className="text-xs">{item.note}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

const CostDetailRow = ({ icon: Icon, title, cost, details, detailComponent: DetailComponent }: any) => (
  <AccordionItem value={title.toLowerCase().replace(' ', '-')}>
    <AccordionTrigger className="font-medium hover:no-underline text-base py-3">
      <div className="flex items-center gap-3 flex-1">
        <Icon className="size-5 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        <span className="text-base font-semibold text-foreground pr-2 text-right">
          {formatCurrency(cost)}
        </span>
      </div>
    </AccordionTrigger>
    <AccordionContent className="pl-10">
      {details && <DetailComponent details={details} />}
    </AccordionContent>
  </AccordionItem>
);

export function CostBreakdown({ cost }: { cost: any }) {
  if (cost.validationError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Cost Estimation Failed</AlertTitle>
        <AlertDescription>{cost.validationError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Accordion type="multiple" className="w-full space-y-1">
      <AccordionItem value="total-cost" className="rounded-lg border bg-secondary/50 px-4">
        <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3 text-lg font-semibold">
                <DollarSign className="size-6 text-primary" />
                <span>Total Estimated Cost</span>
            </div>
            <span className="text-2xl font-bold text-primary">
                {formatCurrency(cost.totalCost)}
            </span>
        </div>
      </AccordionItem>
      
      <CostDetailRow 
        icon={Wrench}
        title="Material (Metal) Cost"
        cost={cost.materialCost}
        details={cost.metalCostDetails}
        detailComponent={MetalCostDetails}
      />
      <CostDetailRow 
        icon={Hammer}
        title="Labor Cost"
        cost={cost.laborCost}
        details={cost.laborCostDetails}
        detailComponent={LaborCostDetails}
      />
      <CostDetailRow 
        icon={Diamond}
        title="Diamond Cost"
        cost={cost.diamondCost}
        details={cost.diamondBillDetails}
        detailComponent={DiamondBillDetails}
      />
      <CostDetailRow 
        icon={Gem}
        title="Gemstone Cost"
        cost={cost.gemstoneCost}
        details={cost.gemstoneBillDetails}
        detailComponent={GemstoneBillDetails}
      />

      <AccordionItem value="cost-breakdown-notes">
          <AccordionTrigger className="font-medium hover:no-underline">
              <div className="flex items-center gap-3">
                  <List className="size-5 text-muted-foreground" />
                  <span>Calculation Notes &amp; Breakdown</span>
              </div>
          </AccordionTrigger>
          <AccordionContent className="pl-4">
              <Textarea readOnly value={cost.costBreakdown} rows={10} className="font-mono text-sm bg-secondary border-border" />
          </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
