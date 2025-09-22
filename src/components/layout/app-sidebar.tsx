'use client';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Gem, Calculator } from 'lucide-react';
import Image from 'next/image';
import * as React from 'react';
import { ThemeToggle } from '../theme-toggle';
import { Separator } from '../ui/separator';

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Image src="/Pompeii3.svg" alt="Pompeii3" width={140} height={140} className="shrink-0" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="SKU Analyzer" isActive>
              <Gem />
              <span>SKU Analyzer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Access Datasheet" asChild>
              <a href="https://docs.google.com/spreadsheets/d/13_kDwyiCUsAT5V9e-I6jWpnN3vYbzSHULHiafHP5kyg/" target="_blank" rel="noreferrer" className="flex items-center gap-2">
                <Calculator />
                <span>Access Datasheet</span>
                <StatusDot />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className='items-center'>
        <Separator className='my-2'/>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}

function StatusDot() {
  const [ok, setOk] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let isMounted = true;
    fetch('/api/pricing-status', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (isMounted) setOk(Boolean(d?.ok)); })
      .catch(() => { if (isMounted) setOk(false); });
    return () => { isMounted = false; };
  }, []);
  const color = ok === null ? 'bg-gray-400' : ok ? 'bg-green-500' : 'bg-red-500';
  const title = ok === null ? 'Checking...' : ok ? 'Connected' : 'Not Connected';
  return <span title={title} className={`ml-2 inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}
