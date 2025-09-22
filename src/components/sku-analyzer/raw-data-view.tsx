'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronsDownUp, Settings, Eye, Code } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"
import { ImageCarousel } from './image-carousel';

const FOCUS_FIELDS = [
    'ID', 'Title', 'Description', 'Pick 1', 'Pick 2', 'Pick 3', 'Material', 
    'Metal Purity', 'Exact Carat Total Weight', 'Right Weight', 'Width', 'Weight', 
    'Size', 'Number of Diamonds', 'Metal', 'Main Stone', 'Gender', 'Casting Weight', 
    'Diamond Carat', 'Stone Type', 'Stone Shape', 'Stone Dimensions', 'Stone Carat', 
    'Stone Quantity', 'Supplier Name', 'Supplier Code', 'MFG & Part #', 'Part #2'
];

export function RawDataView({ rawData, images, title, imageHints }: { rawData: Record<string, any>, images: string[], title: string, imageHints: string[] }) {
  const { Title, Description, ...otherData } = rawData;
  const [mode, setMode] = useState<'collapsed' | 'focus' | 'developer'>('collapsed');

  const sortedOtherData = Object.entries(otherData).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB)
  );

  const focusData = FOCUS_FIELDS
    .map(field => {
        const value = rawData[field];
        return value !== undefined && value !== null ? [field, value] : null;
    })
    .filter(Boolean) as [string, any][];

  const renderTable = (data: [string, any][]) => (
    <ScrollArea className="h-96 rounded-md border mt-4">
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[250px] sticky top-0 bg-secondary">Field</TableHead>
                    <TableHead className="sticky top-0 bg-secondary">Value</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map(([key, value]) => (
                <TableRow key={key}>
                    <TableCell className="font-medium text-muted-foreground">{key}</TableCell>
                    <TableCell className="font-mono text-sm">{String(value)}</TableCell>
                </TableRow>
                ))}
            </TableBody>
        </Table>
    </ScrollArea>
  );

  return (
    <Card className="border-secondary shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="text-xl font-semibold font-headline text-foreground">
                Raw ChannelAdvisor Data
            </CardTitle>
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>View Mode: {mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as any)}>
                    <DropdownMenuRadioItem value="collapsed">
                        <ChevronsDownUp className="mr-2 h-4 w-4" />
                        Collapsed
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="focus">
                        <Eye className="mr-2 h-4 w-4" />
                        Focus Mode
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="developer">
                        <Code className="mr-2 h-4 w-4" />
                        Developer Mode
                    </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg">{Title || 'No Title Provided'}</h3>
            <p className="text-muted-foreground mt-1">{Description || 'No Description Provided'}</p>
          </div>

          <Accordion type="single" collapsible value={mode !== 'collapsed' ? "item-1" : ""} onValueChange={(value) => !value && setMode('collapsed')}>
            <AccordionItem value="item-1" className="border-none">
              <AccordionContent className="animate-accordion-down">
                {images && images.length > 0 && (
                    <div className="my-4">
                        <ImageCarousel images={images} title={title} imageHints={imageHints} />
                    </div>
                )}
                {mode === 'focus' && renderTable(focusData)}
                {mode === 'developer' && renderTable(sortedOtherData)}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>
    </Card>
  );
}
