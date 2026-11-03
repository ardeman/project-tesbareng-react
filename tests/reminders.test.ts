// Reminder selection for the daily digest (ADR-006, PRD FR-44–47, plan task A8):
// due_reminders() (non-cohort kinds) and due_cohort_reminders() (cohort days).
// Both are service-role only because they return full email addresses (ADR-005).
import { beforeAll, describe, expect, it } from "vitest";
import { ago, anon, createApp, createCohort, DAY_MS, forceActive, forceClosed, member, must, service, type Member } from "./helpers";

type Reminder = { user_id: string; full_email: string; display_name: string; kind: string; ref_id: string | null; app_name: string; extra: Record<string, unknown> };
const due = async (fn: "due_reminders" | "due_cohort_reminders", userId: string) =>
  ((await must(service.rpc(fn))) as Reminder[]).filter((r) => r.user_id === userId);
const today = () => new Date().toISOString().slice(0, 10);

let admin: Member;
beforeAll(async () => {
  admin = await member("yusuf", "Yusuf Hidayat", "admin");
});

const masked = (m: Member) => `${m.email.slice(0, 2)}*****@gmail.com`;
async function entry(m: Member, app: string, over: Record<string, unknown> = {}) {
  return (await must(service.from("testers").insert({
    app_id: app, user_id: m.id, display_name: m.name, masked_email: masked(m), opted_in_at: ago(1 * DAY_MS), added_by: "self", ...over,
  }).select("id").single())).id as string;
}

describe("access", () => {
  it("neither function is callable by visitors or members", async () => {
    const m = await member("dimas", "Dimas Aditya");
    for (const db of [anon(), m.db]) {
      expect((await db.rpc("due_reminders")).error?.code).toBe("42501");
      expect((await db.rpc("due_cohort_reminders")).error?.code).toBe("42501");
    }
  });
});

describe("due_reminders (non-cohort kinds)", () => {
  let creator: Member;
  let tester: Member;
  beforeAll(async () => {
    [creator, tester] = await Promise.all([member("fajar", "Fajar Nugroho"), member("ayu", "Ayu Lestari")]);
  });

  it("new_build: a build in the last 24 h goes to the app's active testers, not the creator", async () => {
    const app = await createApp(creator);
    await entry(tester, app);
    const build = (await must(service.from("builds").insert({ app_id: app, version_name: "2.0.0", uploaded_at: ago(3_600_000), changelog: "Mode gelap" }).select("id").single())).id;
    const rows = (await due("due_reminders", tester.id)).filter((r) => r.ref_id === build);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "new_build", full_email: tester.email, extra: { version_name: "2.0.0", changelog: "Mode gelap" } });
    expect((await due("due_reminders", creator.id)).filter((r) => r.ref_id === build)).toHaveLength(0);
  });

  it("new_build skips old builds, members who opted out, and reminders already sent today", async () => {
    const app = await createApp(creator);
    const other = await member("sari", "Sari Dewi");
    await entry(tester, app);
    await entry(other, app);
    await must(service.from("builds").insert({ app_id: app, version_name: "1.0.0", uploaded_at: ago(2 * DAY_MS), changelog: "Lama", created_at: ago(2 * DAY_MS) }));
    const build = (await must(service.from("builds").insert({ app_id: app, version_name: "1.0.1", uploaded_at: ago(3_600_000), changelog: "Baru" }).select("id").single())).id;
    expect((await due("due_reminders", tester.id)).filter((r) => r.kind === "new_build" && r.app_name === "Jadwal Sholat Widget" && r.ref_id !== build && r.extra.version_name === "1.0.0")).toHaveLength(0);
    await must(other.db.rpc("set_email_reminders", { p_enabled: false }));
    expect((await due("due_reminders", other.id)).filter((r) => r.ref_id === build)).toHaveLength(0);
    await must(service.from("reminder_log").insert({ user_id: tester.id, kind: "new_build", ref_id: build, sent_on: today() }));
    expect((await due("due_reminders", tester.id)).filter((r) => r.ref_id === build)).toHaveLength(0);
  });

  it("unreplied_feedback: verified feedback unreplied for more than 3 days goes to the creator", async () => {
    const app = await createApp(creator);
    const t = await entry(tester, app, { feedback_sent: true, feedback_sent_at: ago(4 * DAY_MS), feedback_verified: true });
    const rows = (await due("due_reminders", creator.id)).filter((r) => r.ref_id === t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "unreplied_feedback", extra: { tester_name: tester.name } });
    await must(service.from("testers").update({ replied: true }).eq("id", t));
    expect((await due("due_reminders", creator.id)).filter((r) => r.ref_id === t)).toHaveLength(0);
  });

  it("app_eligible: once ever, when the app reaches 12 eligible testers", async () => {
    const app = await createApp(creator);
    await must(service.from("testers").insert(Array.from({ length: 12 }, (_, i) => ({
      app_id: app, display_name: `Tester ${i}`, masked_email: "te*****@gmail.com", opted_in_at: ago(15 * DAY_MS), added_by: "creator",
    }))));
    expect((await due("due_reminders", creator.id)).filter((r) => r.ref_id === app && r.kind === "app_eligible")).toHaveLength(1);
    await must(service.from("reminder_log").insert({ user_id: creator.id, kind: "app_eligible", ref_id: app, sent_on: "2026-10-01" }));
    expect((await due("due_reminders", creator.id)).filter((r) => r.ref_id === app && r.kind === "app_eligible")).toHaveLength(0);
  });
});

describe("due_cohort_reminders (FR-45 cohort days)", () => {
  let creator: Member;
  let creator2: Member;

  beforeAll(async () => {
    [creator, creator2] = await Promise.all([member("rizky", "Rizky Ramadhan"), member("wulan", "Wulan Sari")]);
  });

  /** An Active cohort where `m` holds two assignments made `days` ago, on apps named Bravo and Alfa. */
  async function cohortFor(m: Member, days: number) {
    const [a1, a2] = await Promise.all([createApp(creator, { p_name: "Bravo Kasir" }), createApp(creator2, { p_name: "Alfa Catatan" })]);
    const id = await createCohort(admin, "Cohort Uji Pengingat");
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: a1 },
      { cohort_id: id, user_id: creator2.id, app_id: a2 },
      { cohort_id: id, user_id: m.id },
    ]));
    await forceActive(id, days);
    const at = ago(days * DAY_MS);
    await must(service.from("assignments").insert([
      { cohort_id: id, tester_user_id: m.id, app_id: a1, assigned_at: at },
      { cohort_id: id, tester_user_id: m.id, app_id: a2, assigned_at: at },
    ]));
    return { id, a1, a2 };
  }
  const forCohort = async (m: Member, id: string) => (await due("due_cohort_reminders", m.id)).filter((r) => r.ref_id === id);

  it("Day 1: one row listing every app not opted in yet, with the 48 h deadline", async () => {
    const m = await member("hana", "Hana Safitri");
    const { id } = await cohortFor(m, 1.2);
    const rows = await forCohort(m, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "cohort_opt_in", app_name: "Cohort Uji Pengingat", full_email: m.email, extra: { day: 1, apps: ["Alfa Catatan", "Bravo Kasir"] } });
    const dueAt = Date.parse(rows[0].extra.due_at as string);
    expect(Math.abs(dueAt - (Date.now() - 1.2 * DAY_MS + 2 * DAY_MS))).toBeLessThan(60_000);
  });

  it("Day 2: opt-in again for the apps still missing; opted-in apps drop out", async () => {
    const m = await member("made", "Made Suardana");
    const { id, a1 } = await cohortFor(m, 2.3);
    await entry(m, a1);
    const rows = await forCohort(m, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "cohort_opt_in", extra: { day: 2, apps: ["Alfa Catatan"] } });
  });

  it("Day 3 and 4: nothing", async () => {
    const m = await member("tri", "Tri Wahyuni");
    for (const d of [3.1, 4.5]) {
      const { id } = await cohortFor(m, d);
      expect(await forCohort(m, id)).toHaveLength(0);
    }
  });

  it("Day 5: feedback not sent on opted-in apps", async () => {
    const m = await member("fitri", "Fitri Handayani");
    const { id, a1, a2 } = await cohortFor(m, 5.4);
    await entry(m, a1);
    await entry(m, a2, { feedback_sent: true, feedback_sent_at: ago(DAY_MS) });
    const rows = await forCohort(m, id);
    expect(rows).toEqual([expect.objectContaining({ kind: "cohort_feedback", extra: expect.objectContaining({ day: 5, apps: ["Bravo Kasir"] }) })]);
  });

  it("Day 7: used-app check-in or feedback missing", async () => {
    const m = await member("novita", "Novita Sembiring");
    const { id, a1, a2 } = await cohortFor(m, 7.1);
    const t1 = await entry(m, a1, { feedback_sent: true, feedback_sent_at: ago(DAY_MS) });
    await must(service.from("check_ins").insert({ tester_id: t1, kind: "used_app" }));
    await entry(m, a2, { feedback_sent: true, feedback_sent_at: ago(DAY_MS) });
    const rows = await forCohort(m, id);
    expect(rows).toEqual([expect.objectContaining({ kind: "cohort_used_app", extra: expect.objectContaining({ day: 7, apps: ["Alfa Catatan"] }) })]);
  });

  it("Day 13: 'Masih opt-in' missing", async () => {
    const m = await member("andi", "Andi Muhammad Akbar");
    const { id, a1, a2 } = await cohortFor(m, 13.2);
    await entry(m, a1);
    const t2 = await entry(m, a2);
    await must(service.from("check_ins").insert({ tester_id: t2, kind: "still_opted_in" }));
    const rows = await forCohort(m, id);
    expect(rows).toEqual([expect.objectContaining({ kind: "cohort_still_opted_in", extra: expect.objectContaining({ day: 13, apps: ["Bravo Kasir"] }) })]);
  });

  it("skips members who opted out, reminders already sent today, closed cohorts, deleted apps and reassigned slots", async () => {
    const quiet = await member("lukman", "Lukman Hakim");
    const q = await cohortFor(quiet, 1.2);
    await must(quiet.db.rpc("set_email_reminders", { p_enabled: false }));
    expect(await forCohort(quiet, q.id)).toHaveLength(0);

    const sent = await member("rudi", "Rudi Hartono");
    const s = await cohortFor(sent, 1.2);
    await must(service.from("reminder_log").insert({ user_id: sent.id, kind: "cohort_opt_in", ref_id: s.id, sent_on: today() }));
    expect(await forCohort(sent, s.id)).toHaveLength(0);

    const closed = await member("faisal", "Faisal Lubis");
    const c = await cohortFor(closed, 1.2);
    await forceClosed(c.id);
    expect(await forCohort(closed, c.id)).toHaveLength(0);

    const gone = await member("ketut", "Ketut Arsana");
    const g = await cohortFor(gone, 1.2);
    await must(creator.db.rpc("delete_app", { p_app_id: g.a1 }));
    const rows = await forCohort(gone, g.id);
    expect(rows[0].extra.apps).toEqual(["Alfa Catatan"]);
    const helper = await member("bagus", "Bagus Wicaksono");
    await must(service.from("cohort_members").insert({ cohort_id: g.id, user_id: helper.id }));
    const slot = (await must(service.from("assignments").select("id").eq("cohort_id", g.id).eq("tester_user_id", gone.id).eq("app_id", g.a2).single())).id;
    const moved = (await must(service.from("assignments").insert({ cohort_id: g.id, tester_user_id: helper.id, app_id: g.a2 }).select("id").single())).id;
    await must(service.from("assignments").update({ state: "reassigned", reassigned_to: moved }).eq("id", slot));
    expect(await forCohort(gone, g.id)).toHaveLength(0);
  });
});
