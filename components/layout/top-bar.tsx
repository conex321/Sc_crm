import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "./user-menu";
import { GlobalSearchTrigger } from "./global-search";
import { QuickAdd } from "./quick-add";
import type { SessionUser } from "@/lib/auth/session";

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="bg-card flex h-[48px] shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <GlobalSearchTrigger />
      <QuickAdd />
      <div className="flex-1" />
      <UserMenu user={user} />
    </header>
  );
}
