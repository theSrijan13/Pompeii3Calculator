import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { CostBreakdown } from "./cost-breakdown";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";


const renderValue = (value: any): React.ReactNode => {
    if (typeof value === 'boolean') {
      return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
    }
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground/60">N/A</span>;
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground/60">N/A</span>;
        return (
          <div className="flex flex-col gap-2">
            {value.map((item, index) => (
              <div key={index} className="bg-secondary/50 p-3 rounded-md border border-border">
                {renderValue(item)}
              </div>
            ))}
          </div>
        );
      }
      return <ProductSpecificationsTable specifications={value} />;
    }
    return value.toString();
  };
  
  const ProductSpecificationsTable = ({ specifications }: { specifications: Record<string, any> }) => {
    return (
      <Table>
        <TableBody>
          {Object.entries(specifications).map(([key, value]) => (
            <TableRow key={key} className="hover:bg-muted/20">
              <TableCell className="w-1/3 font-medium text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</TableCell>
              <TableCell>{renderValue(value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  
export function ProductSpecifications({
  specifications,
  cost,
}: {
  specifications: Record<string, any>;
  cost: any
}) {

  const {
    metal_purity,
    metal_weight,
    stone_used,
    diamond_details,
    gemstone_details,
    visual_analysis,
    ...otherSpecs
  } = specifications;

  const metalSpecs = { metal_purity, metal_weight };

  const laborDetails = {
    'Cost per Stone': cost?.laborCostDetails?.costPerStone,
    'Base Labor Cost': cost?.laborCostDetails?.baseLaborCost,
  };

  const laborBreakdown = {
    'Diamond Count': cost?.laborCostDetails?.diamondCount,
    'Gemstone Count': cost?.laborCostDetails?.gemstoneCount,
  };

  return (
    <Card className="border-secondary shadow-md w-full">
      <CardHeader>
        <CardTitle className="text-xl font-semibold font-headline text-foreground">AI Enriched Specifications</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="cost" className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
            <TabsTrigger value="cost">Cost</TabsTrigger>
            <TabsTrigger value="metal">Metal</TabsTrigger>
            <TabsTrigger value="diamonds">Diamonds</TabsTrigger>
            <TabsTrigger value="gemstones">Gemstones</TabsTrigger>
            <TabsTrigger value="visual">Visual</TabsTrigger>
            <TabsTrigger value="labor">Labor</TabsTrigger>
          </TabsList>

          <TabsContent value="cost" className="mt-4">
            <CostBreakdown cost={cost} />
          </TabsContent>
          <TabsContent value="metal" className="mt-4">
             <ProductSpecificationsTable specifications={metalSpecs} />
          </TabsContent>
          <TabsContent value="diamonds" className="mt-4">
            {diamond_details ? <ProductSpecificationsTable specifications={diamond_details} /> : <p className="text-muted-foreground text-center p-4">No diamond details available.</p>}
          </TabsContent>
          <TabsContent value="gemstones" className="mt-4">
            {gemstone_details ? <ProductSpecificationsTable specifications={gemstone_details} /> : <p className="text-muted-foreground text-center p-4">No gemstone details available.</p>}
          </TabsContent>
          <TabsContent value="visual" className="mt-4">
            <ProductSpecificationsTable specifications={visual_analysis} />
          </TabsContent>
           <TabsContent value="labor" className="mt-4">
             <Accordion type="single" collapsible className="w-full">
                <Table>
                    <TableBody>
                        <TableRow className="hover:bg-muted/20">
                            <TableCell className="w-1/3 font-medium text-muted-foreground capitalize">Total Stones</TableCell>
                            <TableCell>
                                <AccordionItem value="item-1" className="border-b-0">
                                    <AccordionTrigger className="p-0 hover:no-underline">
                                        {cost?.laborCostDetails?.totalStones}
                                    </AccordionTrigger>
                                    <AccordionContent className="p-0">
                                        <div className="pl-4 mt-2 border-l">
                                            <ProductSpecificationsTable specifications={laborBreakdown} />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
             </Accordion>
             <ProductSpecificationsTable specifications={laborDetails} />
           </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
