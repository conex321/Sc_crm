# Website lead capture → CRM

The CRM exposes a public endpoint that turns a schoolconex.com contact-form
submission into a CRM account + contact + follow-up task (assigned to the lead
owner, Rayan by default) and pings Slack.

- **Endpoint:** `POST https://sc-crm-sand.vercel.app/api/leads/website`
- **Auth:** shared secret in the `X-Lead-Token` header (or a `token` field).
  Set `WEBSITE_LEAD_TOKEN` in the CRM's Vercel env, then give the web team the
  same value. The endpoint **fails closed** — with no token configured it
  rejects everything, so nothing can post before it's wired up.
- **Owner:** `WEBSITE_LEAD_OWNER_EMAIL` (defaults to `rayan@schoolconex.com`).
- **Idempotent:** the same email+school within a run won't create a duplicate
  account; it enriches the existing one.

## Fields (JSON or form-encoded)

| field | required | notes |
|-------|----------|-------|
| `name` | one of name/email/school | contact's full name |
| `email` | " | used to match/create the contact |
| `school` | " | used to match/create the account |
| `phone` | no | stored on the contact |
| `message` | no | shown on the activity timeline |
| `utm_source` / `utm_medium` / `utm_campaign` | no | attribution |
| `company` | no | **honeypot** — keep it hidden; bots that fill it are dropped |

## Server-side proxy (recommended — keeps the token off the page)

Have the site's form post to its own backend, which forwards to the CRM with
the secret header (never expose `WEBSITE_LEAD_TOKEN` in client-side code):

```js
// on schoolconex.com's server
await fetch("https://sc-crm-sand.vercel.app/api/leads/website", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-lead-token": process.env.WEBSITE_LEAD_TOKEN,
  },
  body: JSON.stringify({
    name: form.name,
    email: form.email,
    school: form.school,
    phone: form.phone,
    message: form.message,
    utm_source: form.utm_source,
    utm_medium: form.utm_medium,
    utm_campaign: form.utm_campaign,
  }),
});
```

## Plain HTML fallback (token visible — only for a low-risk/rotatable token)

```html
<form id="sc-lead">
  <input name="name" placeholder="Your name" required />
  <input name="email" type="email" placeholder="Email" required />
  <input name="school" placeholder="School / organization" />
  <input name="phone" placeholder="Phone" />
  <textarea name="message" placeholder="How can we help?"></textarea>
  <!-- honeypot: keep hidden from real users -->
  <input name="company" tabindex="-1" autocomplete="off"
         style="position:absolute;left:-9999px" aria-hidden="true" />
  <button type="submit">Send</button>
</form>
<script>
  document.getElementById("sc-lead").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.utm_source = new URLSearchParams(location.search).get("utm_source") || "";
    await fetch("https://sc-crm-sand.vercel.app/api/leads/website", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lead-token": "PUBLIC_TOKEN_HERE" },
      body: JSON.stringify(data),
    });
    e.target.reset();
    alert("Thanks — we'll be in touch.");
  });
</script>
```

## Test

```bash
curl -X POST https://sc-crm-sand.vercel.app/api/leads/website \
  -H "content-type: application/json" -H "x-lead-token: $WEBSITE_LEAD_TOKEN" \
  -d '{"name":"Test Parent","email":"test@example.com","school":"Test Academy","message":"Interested in OSSD"}'
# → {"ok":true,"accountId":"…","contactId":"…","createdAccount":true}
```
