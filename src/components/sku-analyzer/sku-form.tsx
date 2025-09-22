'use client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function SkuForm({ formAction, isPending, sku, setSku }: { formAction: any, isPending: boolean, sku: string, setSku: (sku: string) => void }) {
  return (
    <form action={formAction} className="flex flex-col sm:flex-row items-center gap-4">
      <Input
        name="sku"
        placeholder="Enter product SKU..."
        required
        className="flex-grow text-base font-mono"
        disabled={isPending}
        value={sku}
        onChange={(e) => setSku(e.target.value)}
      />
      <Button type="submit" disabled={isPending} className="w-full sm:w-auto shadow-lg hover:shadow-glow-primary transition-shadow">
        {isPending ? 'Analyzing...' : <> <Search className="mr-2 size-4" /> Analyze SKU </>}
      </Button>
    </form>
  );
}

export function SkuFormSkeleton() {
    return (
        <div className="p-4 border rounded-lg space-y-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
        </div>
    )
}
