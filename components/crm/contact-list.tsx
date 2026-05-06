import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MessageCircle, Plus } from "lucide-react";
import type { ContactRow } from "@/lib/crm/contacts";

export function ContactList({
  accountId,
  contacts,
  canEdit,
}: {
  accountId: string;
  contacts: ContactRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href={`/accounts/${accountId}/contacts/new`}>
            <Plus className="size-3.5" /> Add contact
          </Link>
        </Button>
      </div>
      {contacts.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
          No contacts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full">
            <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">WhatsApp</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t hover:bg-muted/30 [&_td]:px-3 [&_td]:py-2"
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {c.first_name} {c.last_name}
                      </span>
                      {c.is_primary && (
                        <Badge variant="secondary" className="text-[10px]">
                          primary
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="text-muted-foreground">{c.role ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <Mail className="size-3" />
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground">
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        <Phone className="size-3" />
                        {c.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted-foreground">
                    {c.whatsapp_phone ? (
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="size-3" />
                        {c.whatsapp_phone}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/accounts/${accountId}/contacts/${c.id}/edit`}>
                          Edit
                        </Link>
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
