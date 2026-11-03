// ADR-006: daily email digest via Gmail SMTP.
// Triggered by pg_cron via pg_net HTTP POST (see supabase/snippets/setup_cron.sql).
// JWT verification is OFF for this function; a shared secret is checked instead.
// Local dev: SMTP points at Inbucket (no TLS, no auth) on port 54325.
// Production: smtp.gmail.com:465 (implicit TLS) with an App Password.

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const REMINDER_SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://tesbareng.vercel.app";

const isLocal =
  SUPABASE_URL.includes("127.0.0.1") || SUPABASE_URL.includes("localhost");

function makeTransport() {
  if (isLocal) {
    return nodemailer.createTransport({ host: "localhost", port: 54325, secure: false });
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

type ReminderRow = {
  user_id: string;
  full_email: string;
  display_name: string;
  kind: string;
  ref_id: string | null;
  app_name: string;
  extra: Record<string, unknown>;
};

type UserDigest = {
  user_id: string;
  full_email: string;
  display_name: string;
  items: ReminderRow[];
};

function groupByUser(rows: ReminderRow[]): UserDigest[] {
  const map = new Map<string, UserDigest>();
  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, {
        user_id: row.user_id,
        full_email: row.full_email,
        display_name: row.display_name,
        items: [],
      });
    }
    map.get(row.user_id)!.items.push(row);
  }
  return [...map.values()];
}

function renderItem(item: ReminderRow): string {
  const e = item.extra ?? {};
  switch (item.kind) {
    case "new_build":
      return `<li><strong>${item.app_name}</strong> punya build baru: ${e.version_name ?? ""}. ${e.changelog ?? ""}</li>`;
    case "unreplied_feedback":
      return `<li>Feedback dari <strong>${e.tester_name ?? ""}</strong> di <strong>${item.app_name}</strong> sudah diverifikasi tapi belum kamu balas lebih dari 3 hari.</li>`;
    case "app_eligible":
      return `<li>Selamat! <strong>${item.app_name}</strong> sudah punya ${e.eligible_count ?? 12} tester eligible (≥14 hari aktif). Siap daftar ke Google Play!</li>`;
    default:
      return `<li>${item.kind} — ${item.app_name}</li>`;
  }
}

function buildEmail(digest: UserDigest): { subject: string; html: string } {
  const items = digest.items.map(renderItem).join("\n");
  const unsubUrl = `${APP_URL}/me`;
  const subject = `TesBareng — ${digest.items.length} tugas menunggumu hari ini`;
  const html = `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin-top:32px">Halo ${digest.display_name},</h2>
  <p>Berikut tugas TesBareng yang masih perlu kamu selesaikan hari ini:</p>
  <ul style="line-height:1.7">${items}</ul>
  <p>
    <a href="${APP_URL}/me"
       style="display:inline-block;background:#F5C842;color:#1a1a1a;font-weight:700;
              padding:12px 24px;border-radius:4px;text-decoration:none;border:2px solid #1a1a1a">
      Buka Tugas Saya
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0">
  <p style="font-size:13px;color:#666">
    Kamu menerima email ini karena kamu anggota komunitas TesBareng.<br>
    <a href="${unsubUrl}">Matikan notifikasi email</a>
  </p>
</body>
</html>`.trim();
  return { subject, html };
}

Deno.serve(async (req) => {
  // Auth: shared secret in header (JWT verification is off for this function).
  const secret = req.headers.get("x-reminder-secret") ?? "";
  if (!REMINDER_SECRET || secret !== REMINDER_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await supabase.rpc("due_reminders");
  if (error) {
    console.error("due_reminders() error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const digests = groupByUser((rows ?? []) as ReminderRow[]);
  const transport = makeTransport();
  const results: { user_id: string; ok: boolean; error?: string }[] = [];

  for (const digest of digests) {
    const { subject, html } = buildEmail(digest);
    const from = isLocal
      ? '"TesBareng" <noreply@tesbareng.local>'
      : `"TesBareng" <${GMAIL_USER}>`;
    try {
      await transport.sendMail({ from, to: digest.full_email, subject, html });

      // Log each sent item (idempotency guard FR-47).
      for (const item of digest.items) {
        await supabase.from("reminder_log").upsert(
          {
            user_id: item.user_id,
            kind: item.kind,
            ref_id: item.ref_id ?? null,
            sent_on: new Date().toISOString().slice(0, 10),
          },
          { onConflict: "user_id,kind,ref_id,sent_on", ignoreDuplicates: true }
        );
      }
      results.push({ user_id: digest.user_id, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Email failed for ${digest.user_id}:`, msg);
      results.push({ user_id: digest.user_id, ok: false, error: msg });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`send-reminders: sent=${sent} failed=${failed}`);

  return new Response(
    JSON.stringify({ sent, failed, total: digests.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
