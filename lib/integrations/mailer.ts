import "server-only";
import nodemailer from "nodemailer";

// Transactional sender for CRM-generated notifications (the daily digest).
// Uses Google Workspace SMTP with an app password on a dedicated address — no
// new SaaS. Inert until SMTP_USER + SMTP_PASS are set; callers check
// mailerConfigured() first. This is the CRM app notifying its own users, not
// email composed on anyone's behalf.

export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_PORT ?? "465") === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!mailerConfigured()) return { sent: false, error: "smtp-not-configured" };
  const from =
    process.env.SMTP_FROM ?? `SchoolConex CRM <${process.env.SMTP_USER}>`;
  try {
    await transport().sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}
