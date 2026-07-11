// D-044: single source of truth for the lead-import feature. The template
// headers, the auto-mapper, and the import engine all derive from this
// registry, so a downloaded template can never drift from what the mapper
// expects. Shared by client (wizard, template generation) and server (engine).

export type ImportFieldKey =
  | "account_name"
  | "account_type"
  | "website"
  | "account_phone"
  | "address"
  | "country"
  | "source"
  | "account_email"
  | "account_linkedin"
  | "contact_first_name"
  | "contact_last_name"
  | "contact_full_name"
  | "contact_role"
  | "contact_email"
  | "contact_phone"
  | "whatsapp_phone"
  | "contact_linkedin";

export type ImportField = {
  key: ImportFieldKey;
  /** Exact header used in the downloadable template. */
  header: string;
  required?: boolean;
  example: string;
  /** Lower-cased, punctuation-stripped alternates seen in the wild
   *  (Pipedrive/HubSpot exports, the OSSD Google Sheet, generic lists). */
  aliases: string[];
};

/** Normalize a header for matching: lowercase, strip non-alphanumerics. */
export const normHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: "account_name",
    header: "Account Name",
    required: true,
    example: "Maple Leaf International School",
    aliases: ["school", "company", "companyname", "organization", "organisation", "accountname", "name", "schoolname", "org"],
  },
  {
    key: "account_type",
    header: "Account Type",
    example: "school",
    aliases: ["type", "accounttype", "organizationtype", "typeofprogram", "category"],
  },
  {
    key: "website",
    header: "Website",
    example: "https://mapleleaf.example.edu",
    aliases: ["websiteurl", "companywebsite", "url", "companydomainname", "domain"],
  },
  {
    key: "account_phone",
    header: "Account Phone",
    example: "+1 416 555 0100",
    aliases: ["number", "phone", "phonenumber", "companyphone", "schoolphone", "telephone", "tel"],
  },
  {
    key: "address",
    header: "Address",
    example: "100 School Rd, Toronto, ON",
    aliases: ["streetaddress", "companyaddress", "fulladdress", "location"],
  },
  {
    key: "country",
    header: "Country",
    example: "Canada",
    aliases: ["countryregion", "companycountry", "nation"],
  },
  {
    key: "source",
    header: "Source",
    example: "conference",
    aliases: ["leadsource", "originalsource", "sourceoflead"],
  },
  {
    key: "account_email",
    header: "Account Email",
    example: "info@mapleleaf.example.edu",
    aliases: ["companyemail", "schoolemail", "generalemail", "infoemail"],
  },
  {
    key: "account_linkedin",
    header: "Company LinkedIn",
    example: "https://linkedin.com/company/mapleleaf",
    aliases: ["companylinkedin", "schoolslinkedin", "schoollinkedin", "linkedincompanypage", "companylinkedinurl"],
  },
  {
    key: "contact_first_name",
    header: "Contact First Name",
    example: "Jane",
    aliases: ["firstname", "first", "givenname", "contactfirstname"],
  },
  {
    key: "contact_last_name",
    header: "Contact Last Name",
    example: "Smith",
    aliases: ["lastname", "last", "surname", "familyname", "contactlastname"],
  },
  {
    key: "contact_full_name",
    header: "Contact Full Name",
    example: "Jane Smith",
    aliases: ["fullname", "contactname", "principal", "staff", "contactperson", "personname"],
  },
  {
    key: "contact_role",
    header: "Contact Role",
    example: "Principal",
    aliases: ["contacttitle", "jobtitle", "title", "position", "role", "designation"],
  },
  {
    key: "contact_email",
    header: "Contact Email",
    example: "jane.smith@mapleleaf.example.edu",
    aliases: ["email", "emailaddress", "principalsemail", "workemail", "staffscontact"],
  },
  {
    key: "contact_phone",
    header: "Contact Phone",
    example: "+1 416 555 0101",
    aliases: ["mobile", "mobilephone", "cell", "cellphone", "directphone", "principalsnumber", "contactnumber"],
  },
  {
    key: "whatsapp_phone",
    header: "WhatsApp Phone",
    example: "+1 416 555 0101",
    aliases: ["whatsapp", "whatsappnumber"],
  },
  {
    key: "contact_linkedin",
    header: "Contact LinkedIn",
    example: "https://linkedin.com/in/janesmith",
    aliases: ["linkedin", "linkedinurl", "linkedinprofile", "principalslinkedin", "contactlinkedinurl"],
  },
];

/** fileHeader -> field key, or null to skip that column. */
export type ColumnMapping = Record<string, ImportFieldKey | null>;

/**
 * Auto-map file headers to fields: exact template-header match first, then
 * alias match — both after normalization. Duplicate targets keep the first
 * column and leave later ones unmapped (user resolves in the mapping step).
 */
export function autoMap(headers: string[]): ColumnMapping {
  const byNorm = new Map<string, ImportFieldKey>();
  for (const f of IMPORT_FIELDS) byNorm.set(normHeader(f.header), f.key);
  for (const f of IMPORT_FIELDS) {
    for (const a of f.aliases) if (!byNorm.has(a)) byNorm.set(a, f.key);
  }
  const used = new Set<ImportFieldKey>();
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    const key = byNorm.get(normHeader(h)) ?? null;
    if (key && !used.has(key)) {
      mapping[h] = key;
      used.add(key);
    } else {
      mapping[h] = null;
    }
  }
  return mapping;
}

export const ACCOUNT_TYPES = ["school", "aspiring_founder", "district", "other"] as const;
export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

/** One source row after the mapping has been applied client-side. */
export type MappedRow = {
  /** 1-based row number in the source file — the per-batch idempotency key. */
  rowIndex: number;
  account: {
    name: string;
    type?: AccountTypeValue;
    website?: string;
    phone?: string;
    address?: string;
    country?: string;
    source?: string;
    email?: string;
    linkedin?: string;
  };
  contact?: {
    firstName?: string;
    lastName?: string;
    role?: string;
    email?: string;
    phone?: string;
    whatsappPhone?: string;
    linkedin?: string;
  };
};

const MAX_CELL = 500;
const clean = (v: unknown): string =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, MAX_CELL);

/** Coerce a free-text type cell to the enum; unknown values become "school". */
export function coerceAccountType(v: string): AccountTypeValue {
  const n = normHeader(v);
  if (!n) return "school";
  if (n.includes("district")) return "district";
  if (n.includes("founder")) return "aspiring_founder";
  if (n.includes("school") || n.includes("academy") || n.includes("college")) return "school";
  if (n.includes("agency") || n.includes("company") || n.includes("consult") || n.includes("other"))
    return "other";
  return "school";
}

/**
 * Apply a ColumnMapping to raw parsed rows (array of objects keyed by file
 * header). Rows with no account name are dropped (counted by the caller).
 * Contact Full Name splits into first/last when the split fields are absent.
 */
export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
): { mapped: MappedRow[]; droppedNoName: number } {
  const entries = Object.entries(mapping).filter(([, k]) => k != null) as [
    string,
    ImportFieldKey,
  ][];
  const mapped: MappedRow[] = [];
  let droppedNoName = 0;

  rows.forEach((row, i) => {
    const get = (key: ImportFieldKey): string => {
      const entry = entries.find(([, k]) => k === key);
      return entry ? clean(row[entry[0]]) : "";
    };

    const name = get("account_name");
    if (!name) {
      droppedNoName++;
      return;
    }

    let first = get("contact_first_name");
    let last = get("contact_last_name");
    const full = get("contact_full_name");
    if (!first && !last && full) {
      const parts = full.split(/\s+/);
      first = parts[0] ?? "";
      last = parts.slice(1).join(" ");
    }

    const typeRaw = get("account_type");
    const contactEmail = get("contact_email").toLowerCase();
    const hasContact = Boolean(first || last || contactEmail || get("contact_phone"));

    mapped.push({
      rowIndex: i + 2, // +2: 1-based + header row
      account: {
        name,
        type: typeRaw ? coerceAccountType(typeRaw) : undefined,
        website: get("website") || undefined,
        phone: get("account_phone") || undefined,
        address: get("address") || undefined,
        country: get("country") || undefined,
        source: get("source") || undefined,
        email: get("account_email").toLowerCase() || undefined,
        linkedin: get("account_linkedin") || undefined,
      },
      contact: hasContact
        ? {
            firstName: first || undefined,
            lastName: last || undefined,
            role: get("contact_role") || undefined,
            email: contactEmail || undefined,
            phone: get("contact_phone") || undefined,
            whatsappPhone: get("whatsapp_phone") || undefined,
            linkedin: get("contact_linkedin") || undefined,
          }
        : undefined,
    });
  });

  return { mapped, droppedNoName };
}

export const IMPORT_ROW_LIMIT = 10_000;
export const IMPORT_CHUNK_SIZE = 500;
