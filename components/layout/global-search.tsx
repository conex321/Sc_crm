"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-secondary hover:bg-accent h-8 w-64 justify-start gap-2 rounded-full px-3 text-[13px] font-normal md:w-80"
      >
        <Search className="text-pd-text-secondary size-4" />
        <span>Search</span>
        <kbd className="text-pd-text-muted ml-auto rounded-[4px] border px-1 font-mono text-[11px]">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type to search…" />
        <CommandList>
          {/* Phase 1 stub: full-text search across accounts/contacts/opportunities lands later. */}
          <CommandEmpty>Search isn&apos;t wired yet — coming in a follow-up.</CommandEmpty>
        </CommandList>
      </CommandDialog>
    </>
  );
}
