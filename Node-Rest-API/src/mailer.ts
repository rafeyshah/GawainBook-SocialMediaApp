// Sending email. Production uses Resend (https://resend.com/docs/api-reference/emails/send-email)
// when RESEND_API_KEY is set; otherwise emails are written to the server log so
// every flow still works in development. Tests use MemoryMailer.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly kind: "resend" | "log" | "memory";
  send(email: Email): Promise<void>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class ResendMailer implements Mailer {
  readonly kind = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike
  ) {}

  async send(email: Email): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export class LogMailer implements Mailer {
  readonly kind = "log" as const;
  async send(email: Email): Promise<void> {
    // Development only: shows the link you'd have received.
    console.log(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`);
  }
}

export class MemoryMailer implements Mailer {
  readonly kind = "memory" as const;
  sent: Email[] = [];
  fail = false;
  async send(email: Email): Promise<void> {
    if (this.fail) throw new Error("mail down");
    this.sent.push(email);
  }
  last(to?: string): Email | undefined {
    const list = to ? this.sent.filter((e) => e.to === to) : this.sent;
    return list[list.length - 1];
  }
  linkIn(email: Email | undefined): string | undefined {
    return email?.text.match(/https?:\/\/\S+/)?.[0];
  }
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM || "GawainBook <onboarding@resend.dev>");
  return new LogMailer();
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// One plain, friendly layout for every message.
export function renderEmail(opts: { greeting: string; lines: string[]; button: string; url: string; footer: string }) {
  const text = [opts.greeting, "", ...opts.lines, "", `${opts.button}: ${opts.url}`, "", opts.footer, "", "GawainBook"].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328">
<div style="max-width:480px;margin:0 auto;padding:32px 20px">
<p style="font-weight:700;font-size:18px;color:#2f7553;margin:0 0 24px">📖 GawainBook</p>
<div style="background:#fff;border:1px solid #e3e3df;border-radius:12px;padding:24px">
<p style="margin:0 0 12px">${escapeHtml(opts.greeting)}</p>
${opts.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(l)}</p>`).join("")}
<p style="margin:20px 0"><a href="${escapeHtml(opts.url)}" style="background:#2f7553;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(opts.button)}</a></p>
<p style="margin:0;font-size:13px;color:#6b6b73;word-break:break-all">Or paste this link into your browser: ${escapeHtml(opts.url)}</p>
</div>
<p style="font-size:12px;color:#6b6b73;margin:16px 4px 0;line-height:1.5">${escapeHtml(opts.footer)}</p>
</div></body></html>`;
  return { text, html };
}
