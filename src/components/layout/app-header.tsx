'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <div className="mr-4 flex md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          {/* ThemeToggle has been moved to the sidebar footer */}
        </div>
      </div>
    </header>
  );
}
