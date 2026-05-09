// One-off: resolve a Dialpad user by email so we can pin DIALPAD_FILTER_USER_ID.
// Run: tsx scripts/dialpad-lookup-user.mts <email>
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const email = process.argv[2] ?? "Rayan@schoolconex.com";
const token = process.env.DIALPAD_API_KEY;

if (!token) {
  console.error("DIALPAD_API_KEY not set in .env.local");
  process.exit(1);
}

async function main() {
  const url = `https://dialpad.com/api/v2/users?email=${encodeURIComponent(email)}&limit=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  const body = JSON.parse(text) as {
    items?: Array<{
      id: number;
      first_name?: string;
      last_name?: string;
      emails?: string[];
      phone_numbers?: string[];
      state?: string;
    }>;
  };
  const items = body.items ?? [];
  if (items.length === 0) {
    console.error(`No users found for email=${email}`);
    process.exit(2);
  }
  for (const u of items) {
    console.log(
      JSON.stringify(
        {
          id: u.id,
          name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
          emails: u.emails,
          phone_numbers: u.phone_numbers,
          state: u.state,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
