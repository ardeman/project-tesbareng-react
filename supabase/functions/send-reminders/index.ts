// ADR-006: daily email digest via Gmail SMTP.
// Triggered by pg_cron via pg_net HTTP POST (see supabase/snippets/setup_cron.sql).
// JWT verification is OFF for this function (supabase/config.toml); a shared secret is checked instead.
// Local dev: SMTP goes to the local mail catcher (Mailpit, no TLS, no auth), web UI on port 54324.
// Production: smtp.gmail.com:465 (implicit TLS) with an App Password.
//
// Reminders come from two service-role functions, merged into one digest per member:
//   due_reminders()         new builds, unreplied verified feedback, app reached 12 eligible
//   due_cohort_reminders()  cohort days 1/2 (opt-in), 5 (feedback), 7 (used app), 13 (still opted in)

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const REMINDER_SECRET = Deno.env.get("REMINDER_SECRET") ?? "";
const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://tesbareng.vercel.app";
// Inside the local Edge Runtime container, Mailpit answers to the Docker alias `inbucket`.
// (Its container name, supabase_inbucket_tesbareng, does not resolve: DNS labels cannot hold "_".)
const LOCAL_SMTP_HOST = Deno.env.get("LOCAL_SMTP_HOST") ?? "inbucket";
const LOCAL_SMTP_PORT = Number(Deno.env.get("LOCAL_SMTP_PORT") ?? "1025");

// Inside the local Edge Runtime, SUPABASE_URL is the Docker-internal Kong address.
const isLocal = /127\.0\.0\.1|localhost|kong|host\.docker\.internal/.test(SUPABASE_URL);

function makeTransport() {
  if (isLocal) {
    return nodemailer.createTransport({ host: LOCAL_SMTP_HOST, port: LOCAL_SMTP_PORT, secure: false });
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
      map.set(row.user_id, { user_id: row.user_id, full_email: row.full_email, display_name: row.display_name, items: [] });
    }
    map.get(row.user_id)!.items.push(row);
  }
  return [...map.values()];
}

/** Every value from the database is member-written text: escape it before it goes into HTML. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const wib = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const atWib = (iso: unknown) => (typeof iso === "string" ? `${wib.format(new Date(iso))} WIB` : "");

function appList(extra: Record<string, unknown>): string {
  const apps = Array.isArray(extra.apps) ? (extra.apps as unknown[]) : [];
  return apps.map((a) => `<strong>${esc(a)}</strong>`).join(", ");
}

function renderItem(item: ReminderRow): string {
  const e = item.extra ?? {};
  const cohort = `<strong>${esc(item.app_name)}</strong>`;
  switch (item.kind) {
    case "new_build":
      return `<li><strong>${esc(item.app_name)}</strong> punya build baru: ${esc(e.version_name)}. ${esc(e.changelog)} Perbarui dari Play Store, lalu check-in "Sudah update".</li>`;
    case "unreplied_feedback":
      return `<li>Feedback dari <strong>${esc(e.tester_name)}</strong> di <strong>${esc(item.app_name)}</strong> sudah diverifikasi tapi belum Anda balas lebih dari 3 hari.</li>`;
    case "app_eligible":
      return `<li>Selamat! <strong>${esc(item.app_name)}</strong> sudah punya ${esc(e.eligible_count ?? 12)} tester yang lulus 14 hari. Aplikasi Anda siap diajukan ke Google Play.</li>`;
    case "cohort_opt_in":
      return Number(e.day) >= 2
        ? `<li>${cohort}: batas opt-in (${esc(atWib(e.due_at))}) sudah lewat. Daftar jadi tester sekarang di ${appList(e)}.</li>`
        : `<li>${cohort}: daftar jadi tester sebelum ${esc(atWib(e.due_at))} di ${appList(e)}.</li>`;
    case "cohort_feedback":
      return `<li>${cohort}: kirim feedback di Google Play untuk ${appList(e)}. Tenggatnya hari ke-7, ${esc(atWib(e.due_at))}.</li>`;
    case "cohort_used_app":
      return `<li>${cohort}, hari ke-7: check-in "Sudah buka app" dan kirim feedback di Google Play untuk ${appList(e)}.</li>`;
    case "cohort_still_opted_in":
      return `<li>${cohort}, hari ke-13: check-in "Masih opt-in" untuk ${appList(e)}.</li>`;
    default:
      return `<li>${esc(item.kind)}: ${esc(item.app_name)}</li>`;
  }
}

function buildEmail(digest: UserDigest): { subject: string; html: string } {
  const items = digest.items.map(renderItem).join("\n");
  const settingsUrl = `${APP_URL}/me`;
  const subject = `TesBareng: ${digest.items.length} tugas menunggu Anda hari ini`;
  const html = `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="margin-top:32px">Halo ${esc(digest.display_name)},</h2>
  <p>Berikut tugas TesBareng yang masih perlu Anda selesaikan hari ini:</p>
  <ul style="line-height:1.7">${items}</ul>
  <p>
    <a href="${settingsUrl}"
       style="display:inline-block;background:#F5C842;color:#1a1a1a;font-weight:700;
              padding:12px 24px;border-radius:4px;text-decoration:none;border:2px solid #1a1a1a">
      Buka Tugas saya
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0">
  <p style="font-size:13px;color:#666">
    Anda menerima email ini karena Anda anggota komunitas TesBareng.<br>
    <a href="${settingsUrl}">Matikan email pengingat</a>
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

  const [general, cohort] = await Promise.all([supabase.rpc("due_reminders"), supabase.rpc("due_cohort_reminders")]);
  const error = general.error ?? cohort.error;
  if (error) {
    console.error("due reminders error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const digests = groupByUser([...(general.data ?? []), ...(cohort.data ?? [])] as ReminderRow[]);
  const transport = makeTransport();
  const results: { user_id: string; ok: boolean; error?: string }[] = [];

  for (const digest of digests) {
    const { subject, html } = buildEmail(digest);
    const from = isLocal ? '"TesBareng" <noreply@tesbareng.local>' : `"TesBareng" <${GMAIL_USER}>`;
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
          { onConflict: "user_id,kind,ref_id,sent_on", ignoreDuplicates: true },
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

  return new Response(JSON.stringify({ sent, failed, total: digests.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
