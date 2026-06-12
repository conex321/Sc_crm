"use client";

import { useEffect, useState, useTransition } from "react";
import { Link as LinkIcon, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { attachActivityToAccount } from "@/app/(dashboard)/activities/actions";

type AccountRow = { id: string; name: string };
type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

export function AttachToAccountDialog({ activityId }: { activityId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || selectedAccount) return;
    const sb = getSupabaseBrowserClient();
    const handle = setTimeout(async () => {
      let builder = sb
        .from("accounts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name")
        .limit(20);
      const q = query.trim();
      if (q) builder = builder.ilike("name", `%${q}%`);
      const res = await builder;
      if (!res.error) setAccounts((res.data ?? []) as AccountRow[]);
    }, 150);
    return () => clearTimeout(handle);
  }, [open, query, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) {
      setContacts([]);
      return;
    }
    const sb = getSupabaseBrowserClient();
    (async () => {
      const res = await sb
        .from("contacts")
        .select("id, first_name, last_name, email")
        .eq("account_id", selectedAccount.id)
        .is("deleted_at", null)
        .order("first_name")
        .limit(50);
      if (!res.error) setContacts((res.data ?? []) as ContactRow[]);
    })();
  }, [selectedAccount]);

  function reset() {
    setQuery("");
    setAccounts([]);
    setSelectedAccount(null);
    setContacts([]);
  }

  function handleAttach(contactId: string | null) {
    if (!selectedAccount) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("activityId", activityId);
      form.set("accountId", selectedAccount.id);
      if (contactId) form.set("contactId", contactId);
      await attachActivityToAccount(form);
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <LinkIcon className="size-3" /> Attach to account
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
        title={
          selectedAccount
            ? `Pick a contact at ${selectedAccount.name}`
            : "Attach to account"
        }
        description="Choose an account (and optionally a contact) to associate this activity with."
      >
        <CommandInput
          placeholder={
            selectedAccount ? "Filter contacts…" : "Search accounts by name…"
          }
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!selectedAccount && (
            <>
              <CommandEmpty>No accounts match.</CommandEmpty>
              <CommandGroup heading="Accounts">
                {accounts.map((a) => (
                  <CommandItem
                    key={a.id}
                    value={a.name}
                    onSelect={() => {
                      setSelectedAccount(a);
                      setQuery("");
                    }}
                  >
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {selectedAccount && (
            <>
              <CommandEmpty>No contacts at this account.</CommandEmpty>
              <CommandGroup heading="Pick contact (optional)">
                <CommandItem
                  value="__no-contact__"
                  onSelect={() => handleAttach(null)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  Attach to account only (no contact)
                </CommandItem>
                {contacts.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.first_name} ${c.last_name} ${c.email ?? ""}`}
                    onSelect={() => handleAttach(c.id)}
                    disabled={isPending}
                  >
                    <span>
                      {c.first_name} {c.last_name}
                    </span>
                    {c.email && (
                      <span className="ml-2 text-muted-foreground">
                        {c.email}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__back__"
                  onSelect={() => {
                    setSelectedAccount(null);
                    setQuery("");
                  }}
                  disabled={isPending}
                >
                  ← Back to account search
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
