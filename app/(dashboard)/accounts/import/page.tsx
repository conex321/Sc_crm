import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { ImportWizard } from "@/components/crm/import-wizard";

export const maxDuration = 60;

export default async function ImportLeadsPage() {
  await requireUser();
  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Import leads</h1>
          <p className="text-xs text-muted-foreground">
            Bring schools/companies + contacts in from Excel or CSV. Duplicates are
            matched, not re-created.
          </p>
        </div>
        <Link href="/accounts/imports" className="text-xs underline">
          Import history →
        </Link>
      </div>
      <ImportWizard />
    </div>
  );
}
