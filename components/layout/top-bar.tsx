import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { UserMenu } from "./user-menu";
import { GlobalSearchTrigger } from "./global-search";
import type { SessionUser } from "@/lib/auth/session";

export function TopBar({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <GlobalSearchTrigger />
      <div className="flex-1" />
      <UserMenu user={user} />
    </header>
  );
}
