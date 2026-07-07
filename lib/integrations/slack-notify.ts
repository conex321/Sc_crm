import "server-only";

// Post a message to a Slack incoming webhook. No SDK/dep — just a fetch to the
// webhook URL in SLACK_WEBHOOK_URL. These are automated app-to-channel posts
// (reply detected, new website lead), NOT messages sent on anyone's behalf.
// No-ops silently when the webhook isn't configured, so callers never need to
// guard. Never throws — notification failure must not break the caller.

export type SlackBlock = Record<string, unknown>;

export async function slackNotify(
  text: string,
  opts?: { blocks?: SlackBlock[] },
): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, ...(opts?.blocks ? { blocks: opts.blocks } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Convenience: a single-section message with a bold header line + context. */
export async function slackNotifyCard(
  header: string,
  lines: string[],
  linkUrl?: string,
  linkLabel = "Open in CRM",
): Promise<boolean> {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${header}*\n${lines.join("\n")}` },
    },
  ];
  if (linkUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: linkLabel },
          url: linkUrl,
        },
      ],
    });
  }
  return slackNotify(header, { blocks });
}
