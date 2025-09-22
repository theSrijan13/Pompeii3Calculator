'use client';

import { useActionState, useEffect, useState } from 'react';
import { getCostEstimation } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SkuForm, SkuFormSkeleton } from '@/components/sku-analyzer/sku-form';
import { ResultsView } from '@/components/sku-analyzer/results-view';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { Minimize2, ScanLine } from 'lucide-react';

type ActionState = 
  | { error: string; data?: undefined }
  | { data: any; error?: undefined }
  | null;

const initialState: ActionState = null;

export function SkuAnalyzer() {
  const [state, formAction, isPending] = useActionState(getCostEstimation, initialState);
  const { toast } = useToast();
  const [sku, setSku] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (state?.error) {
      toast({
        variant: 'destructive',
        title: 'Analysis Failed',
        description: state.error,
      });
      setIsMinimized(false); // Expand on error
    }
  }, [state?.error, toast]);

  useEffect(() => {
    if (state?.data) {
      // Auto-minimize on successful data load
      const timer = setTimeout(() => setIsMinimized(true), 500);
      return () => clearTimeout(timer);
    }
  }, [state?.data]);

  if (isMinimized && !isPending) {
    return (
      <>
        {state?.data && (
          <div className="animate-fade-in">
            <ResultsView result={state.data} />
          </div>
        )}
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            size="lg"
            className="shadow-2xl rounded-full w-36 h-16"
            onClick={() => setIsMinimized(false)}
          >
            <ScanLine className="mr-2" /> New SKU
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-8">
       <Card className="border-primary/20 shadow-lg hover:shadow-glow-primary transition-shadow duration-300 relative">
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-3 right-3 text-muted-foreground"
          onClick={() => setIsMinimized(true)}
          disabled={!state?.data || isPending}
        >
          <Minimize2 className="size-5"/>
        </Button>
        <CardHeader>
          <CardTitle className="text-2xl font-headline">AI-Powered Cost Analyzer</CardTitle>
          <CardDescription>
            Enter a product SKU to fetch its details and receive an AI-generated cost estimation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SkuForm
            formAction={formAction}
            isPending={isPending}
            sku={sku}
            setSku={setSku}
          />
        </CardContent>
      </Card>

      {isPending && <ResultsSkeleton />}

      {state?.data && (
        <div className="animate-fade-in">
          <ResultsView result={state.data} />
        </div>
      )}
    </div>
  );
}

function ResultsSkeleton() {
    return (
        <Card className="shadow-lg">
            <CardHeader>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-8">
                <div>
                  <Skeleton className="aspect-square w-full rounded-lg" />
                  <div className="flex justify-center mt-4 gap-2">
                      <Skeleton className="h-2 w-8" />
                      <Skeleton className="h-2 w-8" />
                      <Skeleton className="h-2 w-8" />
                  </div>
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <div className="space-y-2 pt-4">
                    <SkuFormSkeleton />
                    <SkuFormSkeleton />
                    <SkuFormSkeleton />
                    <SkuFormSkeleton />
                  </div>
                </div>
            </CardContent>
        </Card>
    );
}
