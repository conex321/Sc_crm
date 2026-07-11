"use client";

import Link from "next/link";
import { Building2, CalendarPlus, KanbanSquare, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const QUICK_ADD_ITEMS = [
  // "New contact" -> /accounts: contact creation is account-scoped
  // (/accounts/[id]/contacts/new); the accounts list IS the account picker.
  // "New activity" -> /dashboard: TaskComposer lives on account/opportunity
  // detail; the dashboard "My day" queue is the entry point.
  { label: "New deal", href: "/opportunities/new", icon: KanbanSquare },
  { label: "New account", href: "/accounts/new", icon: Building2 },
  { label: "New contact", href: "/accounts", icon: User },
  { label: "New activity", href: "/dashboard", icon: CalendarPlus },
] as const;

export function QuickAdd() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Quick add"
          className="bg-primary text-primary-foreground size-8 rounded-full hover:bg-[var(--pd-primary-hover)] active:bg-[var(--pd-primary-active)]"
        >
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {QUICK_ADD_ITEMS.map((item) => (
          <DropdownMenuItem key={item.label} asChild className="cursor-pointer">
            <Link href={item.href}>
              <item.icon className="text-pd-text-secondary size-4" />
              <span>{item.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
