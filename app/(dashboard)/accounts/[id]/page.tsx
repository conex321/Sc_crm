import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Building2, Globe, Phone, MapPin } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAccount } from "@/lib/crm/accounts";
import { listContactsForAccount } from "@/lib/crm/contacts";
import { listOpportunitiesForAccount } from "@/lib/crm/opportunities";
import { listActivitiesForAccount } from "@/lib/crm/activities";
import {
  listDocumentsForAccount,
  listActiveTemplates,
  isDriveConnected,
} from "@/lib/crm/documents";
import { listAccountCampaignActivity } from "@/lib/crm/mailshake";
import { ExternalLink, Send } from "lucide-react";
import { ContactList } from "@/components/crm/contact-list";
import { OpportunityList } from "@/components/crm/opportunity-list";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { NoteComposer } from "@/components/crm/note-composer";
import { TaskComposer } from "@/components/crm/task-composer";
import { DocumentList } from "@/components/crm/document-list";
import { DriveAttachButton } from "@/components/crm/drive-attach-button";
import { GenerateContractDialog } from "@/components/crm/generate-contract-dialog";
import { requireUser } from "@/lib/auth/session";

export default async function AccountDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await props.params;
  const account = await getAccount(id);
  if (!account) notFound();

  const [
    contacts,
    opportunities,
    activities,
    documents,
    templates,
    driveConnected,
    campaignActivity,
  ] = await Promise.all([
    listContactsForAccount(id),
    listOpportunitiesForAccount(id),
    listActivitiesForAccount(id, 50),
    listDocumentsForAccount(id),
    listActiveTemplates(),
    isDriveConnected(user.id),
    listAccountCampaignActivity(id),
  ]);

  return (
    <div className="px-6 py-5">
      {/* Panel 1: Summary */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{account.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="capitalize">
                {account.type.replace("_", " ")}
              </Badge>
              {account.owner?.full_name ? (
                <span>Owner · {account.owner.full_name}</span>
              ) : (
                <span className="italic">Unassigned</span>
              )}
              {account.source && <span>Source · {account.source}</span>}
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/accounts/${account.id}/edit`}>
            <Pencil className="size-3.5" /> Edit
          </Link>
        </Button>
      </div>

      <Card className="mb-5">
        <CardContent className="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-3">
          <SummaryRow icon={Globe} label="Website" value={account.website} link />
          <SummaryRow icon={Phone} label="Phone" value={account.phone} />
          <SummaryRow icon={MapPin} label="Country" value={account.country} />
          {account.address && (
            <div className="col-span-full text-muted-foreground">
              <span className="font-medium text-foreground">Address: </span>
              {account.address}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panels 2+: Activity / Contacts / Opportunities / Documents */}
      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">
            Activity{" "}
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {activities.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts{" "}
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {contacts.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="opportunities">
            Opportunities{" "}
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {opportunities.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents{" "}
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {documents.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="campaigns">
            Campaigns{" "}
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px]">
              {campaignActivity.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-3 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <NoteComposer accountId={account.id} />
            <TaskComposer
              accountId={account.id}
              currentUserId={user.id}
            />
          </div>
          <ActivityTimeline activities={activities} />
        </TabsContent>

        <TabsContent value="contacts" className="mt-3">
          <ContactList accountId={account.id} contacts={contacts} canEdit />
        </TabsContent>

        <TabsContent value="opportunities" className="mt-3">
          <OpportunityList accountId={account.id} opportunities={opportunities} />
        </TabsContent>

        <TabsContent value="campaigns" className="mt-3">
          {campaignActivity.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Send className="mx-auto mb-2 size-5 opacity-50" />
              No Mailshake activity matched to this account yet.
            </div>
          ) : (
            <div className="space-y-4">
              {campaignActivity.map((c) => (
                <div key={c.campaign_id} className="rounded-md border">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/campaigns/${c.mailshake_id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.title}
                      </Link>
                      {c.is_archived ? (
                        <Badge variant="outline" className="text-[10px]">
                          archived
                        </Badge>
                      ) : c.is_paused ? (
                        <Badge variant="secondary" className="text-[10px]">
                          paused
                        </Badge>
                      ) : (
                        <Badge className="text-[10px]">active</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{c.total}</strong> recipients ·{" "}
                        <strong className="text-foreground">{c.engaged}</strong> open ·{" "}
                        <strong className="text-foreground">{c.closed}</strong> closed
                      </span>
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          Mailshake <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.leads.map((l) => (
                        <TableRow key={l.email}>
                          <TableCell>
                            <div className="text-sm">{l.full_name ?? l.email}</div>
                            {l.full_name && (
                              <div className="text-[11px] text-muted-foreground">
                                {l.email}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {l.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {l.last_status_change_at
                              ? new Date(l.last_status_change_at).toLocaleString()
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-3 space-y-3">
          <div className="flex justify-end gap-2">
            <GenerateContractDialog accountId={account.id} templates={templates} />
            <DriveAttachButton
              accountId={account.id}
              driveConnected={driveConnected}
            />
          </div>
          <DocumentList
            accountId={account.id}
            documents={documents}
            emptyAction={
              !driveConnected ? (
                <span>
                  Connect Google Drive first (use the button above).
                </span>
              ) : (
                <span>Attach an existing Drive file or generate from a template.</span>
              )
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  link = false,
}: {
  icon: typeof Globe;
  label: string;
  value: string | null;
  link?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="size-3.5" />
      <span className="font-medium text-foreground">{label}:</span>
      {value ? (
        link ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="truncate">{value}</span>
        )
      ) : (
        <span>—</span>
      )}
    </div>
  );
}
