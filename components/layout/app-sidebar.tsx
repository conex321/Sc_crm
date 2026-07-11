"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Building2,
  KanbanSquare,
  Settings,
  GraduationCap,
  Inbox,
  Plug,
  FileCode,
  Package,
  BarChart3,
  Send,
} from "lucide-react";
import type { User } from "@/lib/db/schema";

// Pipedrive nav item styling: green-tinted active, gray hover (from --sidebar-accent).
const NAV_BTN =
  "rounded-[4px] data-[active=true]:bg-[var(--pd-nav-active-bg)] data-[active=true]:text-[var(--pd-nav-active-fg)] data-[active=true]:font-medium [&[data-active=true]_svg]:text-[var(--pd-nav-active-icon)]";

const GROUP_LABEL = "text-[11px] font-semibold uppercase tracking-wide text-pd-text-muted";

const NAV = [
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/opportunities", label: "Opportunities", icon: KanbanSquare },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
] as const;

const PERSONAL_NAV = [
  { href: "/settings/integrations", label: "Integrations", icon: Plug },
] as const;

const ADMIN_NAV = [
  { href: "/settings/pipelines", label: "Pipelines", icon: KanbanSquare },
  { href: "/settings/catalog", label: "Catalog", icon: Package },
  { href: "/settings/templates", label: "Contract templates", icon: FileCode },
  { href: "/settings/users", label: "Users & roles", icon: Settings },
  { href: "/settings/audit", label: "Audit log", icon: Settings },
] as const;

export function AppSidebar({ role }: { role: User["role"] }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 px-2">
          <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-[4px]">
            <GraduationCap className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">SchoolConex</span>
            <span className="text-pd-text-muted text-[11px]">CRM</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={GROUP_LABEL}>Sales</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    className={NAV_BTN}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/inbox")}
                  tooltip="Unmatched inbox"
                  className={NAV_BTN}
                >
                  <Link href="/inbox">
                    <Inbox className="size-4" />
                    <span>Unmatched inbox</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={GROUP_LABEL}>Personal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PERSONAL_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.label}
                    className={NAV_BTN}
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className={GROUP_LABEL}>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                      className={NAV_BTN}
                    >
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="text-pd-text-muted px-2 pb-2 text-[11px] group-data-[collapsible=icon]:hidden">
          Phase 1 · {process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev"}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
