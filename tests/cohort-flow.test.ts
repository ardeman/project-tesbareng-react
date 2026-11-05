// Cohort flow (plan tasks A4–A6): start_cohort with the ring assignment, joining as a
// pure tester, the obligation views and milestone check-ins.
// Contract: docs/contract.md ("Cohort milestones", the two cohort views, the RPCs).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ago,
  anon,
  createApp,
  createCohort,
  DAY_MS,
  expectCode,
  forceActive,
  forceClosed,
  member,
  must,
  service,
  uniq,
  type Member,
} from "./helpers";

const HOUR_MS = 60 * 60 * 1000;
let admin: Member;

beforeAll(async () => {
  admin = await member("yusuf", "Yusuf Hidayat", "admin");
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A Forming cohort with `nApps` creators (one app each) and `nPure` pure testers. */
async function formingCohort(nApps: number, nPure = 0) {
  const id = await createCohort(admin);
  const creators = await Promise.all(range(nApps).map((i) => member(`kreator${i}`, `Kreator ${i}`)));
  const apps = await Promise.all(creators.map((c) => createApp(c)));
  const pures = await Promise.all(range(nPure).map((i) => member(`murni${i}`, `Tester Murni ${i}`)));
  await Promise.all(
    creators.map((c, i) => must(admin.db.rpc("add_cohort_member", { p_cohort_id: id, p_user_id: c.id, p_app_id: apps[i] }))),
  );
  await Promise.all(pures.map((p) => must(admin.db.rpc("add_cohort_member", { p_cohort_id: id, p_user_id: p.id, p_app_id: null }))));
  return { id, creators, apps, pures };
}

type Assignment = { tester_user_id: string; app_id: string; assigned_at: string; state: string };
const assignmentsOf = async (cohortId: string) =>
  (await must(anon().from("assignments").select("tester_user_id, app_id, assigned_at, state").eq("cohort_id", cohortId))) as Assignment[];
const countBy = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

describe("start_cohort (FR-31–33)", () => {
  it.each([13, 15])("N = %i apps: full mesh, every creator tests every other app", async (n) => {
    const { id, creators, apps } = await formingCohort(n);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    const rows = await assignmentsOf(id);
    expect(rows).toHaveLength(n * (n - 1));
    for (const [i, c] of creators.entries()) {
      const mine = rows.filter((r) => r.tester_user_id === c.id).map((r) => r.app_id);
      expect(new Set(mine)).toEqual(new Set(apps.filter((_, j) => j !== i)));
    }
    for (const count of countBy(rows.map((r) => r.app_id)).values()) expect(count).toBe(n - 1);
  });

  it.each([16, 17, 20])("N = %i apps (all 12 slots, ADR-012 k = 14): ring of 14, every member tests exactly 14 and every app gets exactly 14", async (n) => {
    const { id, apps } = await formingCohort(n);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    const rows = await assignmentsOf(id);
    expect(rows).toHaveLength(n * 14);
    for (const count of countBy(rows.map((r) => r.tester_user_id)).values()) expect(count).toBe(14);
    for (const count of countBy(rows.map((r) => r.app_id)).values()) expect(count).toBe(14);
    expect(new Set(rows.map((r) => r.app_id))).toEqual(new Set(apps));

    // Member at ring position i tests the apps at positions i+1 … i+14 (mod N), never their own.
    const members = await must(anon().from("cohort_members").select("user_id, app_id, ring_position").eq("cohort_id", id));
    const appAt = new Map(members.map((m) => [m.ring_position as number, m.app_id as string]));
    expect(new Set(appAt.keys())).toEqual(new Set(range(n)));
    for (const m of members) {
      const expected = range(14).map((s) => appAt.get(((m.ring_position as number) + 1 + s) % n));
      const mine = rows.filter((r) => r.tester_user_id === m.user_id).map((r) => r.app_id);
      expect(new Set(mine)).toEqual(new Set(expected));
      expect(mine).not.toContain(m.app_id);
    }
  });

  it("sets Day 0, Active status and the same assigned time on every member and assignment", async () => {
    const { id } = await formingCohort(13, 1);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    const c = await must(anon().from("cohorts").select("status, day0_at").eq("id", id).single());
    expect(c.status).toBe("active");
    const day0 = Date.parse(c.day0_at as string);
    expect(Math.abs(Date.now() - day0)).toBeLessThan(60_000);
    const members = await must(anon().from("cohort_members").select("assigned_at").eq("cohort_id", id));
    for (const m of members) expect(Date.parse(m.assigned_at as string)).toBe(day0);
    for (const a of await assignmentsOf(id)) {
      expect(Date.parse(a.assigned_at)).toBe(day0);
      expect(a.state).toBe("open");
    }
  });

  it("gives pure testers 14 apps each, evening out coverage (FR-33)", async () => {
    const { id, pures } = await formingCohort(17, 3);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    const rows = await assignmentsOf(id);
    for (const p of pures) expect(rows.filter((r) => r.tester_user_id === p.id)).toHaveLength(14);
    // 17 × 14 creator slots + 3 × 14 pure slots over 17 apps: every app gets 16 or 17.
    const perApp = [...countBy(rows.map((r) => r.app_id)).values()];
    expect(Math.max(...perApp) - Math.min(...perApp)).toBeLessThanOrEqual(1);
    expect(perApp.reduce((s, x) => s + x, 0)).toBe(17 * 14 + 3 * 14);
  });

  it("gives a pure tester every app when there are fewer than 14", async () => {
    const { id, pures } = await formingCohort(13, 1);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    expect((await assignmentsOf(id)).filter((r) => r.tester_user_id === pures[0].id)).toHaveLength(13);
  });

  it("needs at least 13 apps", async () => {
    const { id } = await formingCohort(12, 2);
    await expectCode(admin.db.rpc("start_cohort", { p_cohort_id: id }), "failed-precondition", /minimal 13/);
    expect(await assignmentsOf(id)).toHaveLength(0);
  });

  it("refuses a cohort with a deleted app, a started cohort, non-admins and a missing cohort", async () => {
    const { id, creators, apps } = await formingCohort(13);
    await expectCode(creators[0].db.rpc("start_cohort", { p_cohort_id: id }), "permission-denied");
    await expectCode(admin.db.rpc("start_cohort", { p_cohort_id: randomUUID() }), "not-found");
    await must(creators[0].db.rpc("delete_app", { p_app_id: apps[0] }));
    await expectCode(admin.db.rpc("start_cohort", { p_cohort_id: id }), "failed-precondition", /dihapus/);
    await must(admin.db.rpc("restore_app", { p_app_id: apps[0] }));
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    await expectCode(admin.db.rpc("start_cohort", { p_cohort_id: id }), "failed-precondition");
  });
});

describe("join_cohort_as_tester (FR-33a/b)", () => {
  it("joins a Forming cohort without assignments; they come at start", async () => {
    const { id } = await formingCohort(13);
    const p = await member("hana", "Hana Safitri");
    await must(p.db.rpc("join_cohort_as_tester", { p_cohort_id: id }));
    const row = await must(anon().from("cohort_members").select("app_id, assigned_at").eq("cohort_id", id).eq("user_id", p.id).single());
    expect(row).toEqual({ app_id: null, assigned_at: null });
    expect((await assignmentsOf(id)).filter((r) => r.tester_user_id === p.id)).toHaveLength(0);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    expect((await assignmentsOf(id)).filter((r) => r.tester_user_id === p.id)).toHaveLength(13);
  });

  it("joining an Active cohort assigns the least-covered apps now, with the member's own clock", async () => {
    const { id } = await formingCohort(17);
    await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
    await must(service.from("cohorts").update({ day0_at: ago(3 * DAY_MS) }).eq("id", id));
    const first = await member("made", "Made Suardana");
    const second = await member("tri", "Tri Wahyuni");
    await must(first.db.rpc("join_cohort_as_tester", { p_cohort_id: id }));
    await must(second.db.rpc("join_cohort_as_tester", { p_cohort_id: id }));
    const rows = await assignmentsOf(id);
    const a = rows.filter((r) => r.tester_user_id === first.id);
    const b = rows.filter((r) => r.tester_user_id === second.id);
    expect(a).toHaveLength(14);
    expect(b).toHaveLength(14);
    // The second joiner fills the 3 apps the first one skipped before doubling up.
    const skipped = new Set(rows.map((r) => r.app_id).filter((x) => !a.some((r) => r.app_id === x)));
    expect(skipped.size).toBe(3);
    for (const x of skipped) expect(b.map((r) => r.app_id)).toContain(x);
    for (const r of a) expect(Date.now() - Date.parse(r.assigned_at)).toBeLessThan(60_000);
    const m = await must(anon().from("cohort_members").select("assigned_at").eq("cohort_id", id).eq("user_id", first.id).single());
    expect(Date.now() - Date.parse(m.assigned_at as string)).toBeLessThan(60_000);
  });

  it("closes after Day 7 and once the cohort is closed", async () => {
    const id = await createCohort(admin);
    await forceActive(id, 6.9);
    const p = await member("fitri", "Fitri Handayani");
    await must(p.db.rpc("join_cohort_as_tester", { p_cohort_id: id }));
    const late = await createCohort(admin);
    await forceActive(late, 7.05);
    await expectCode(p.db.rpc("join_cohort_as_tester", { p_cohort_id: late }), "failed-precondition", /hari ke-7/);
    const closed = await createCohort(admin);
    await forceClosed(closed);
    await expectCode(p.db.rpc("join_cohort_as_tester", { p_cohort_id: closed }), "failed-precondition");
  });

  it("refuses members already in, Owing members, visitors and missing cohorts", async () => {
    const { id, creators } = await formingCohort(13);
    await expectCode(creators[0].db.rpc("join_cohort_as_tester", { p_cohort_id: id }), "already-exists");
    const p = await member("novita", "Novita Sembiring");
    const old = await createCohort(admin);
    await must(p.db.rpc("join_cohort_as_tester", { p_cohort_id: old }));
    await forceClosed(old);
    await must(service.from("cohort_members").update({ standing: "owing" }).eq("cohort_id", old).eq("user_id", p.id));
    await expectCode(p.db.rpc("join_cohort_as_tester", { p_cohort_id: id }), "failed-precondition", /Owing/);
    await expectCode(anon().rpc("join_cohort_as_tester", { p_cohort_id: id }), "unauthenticated");
    await expectCode(p.db.rpc("join_cohort_as_tester", { p_cohort_id: randomUUID() }), "not-found");
  });
});

// ---------------------------------------------------------------- the views

describe("cohort_assignment_status and cohort_obligations", () => {
  let creator: Member;
  let tester: Member;
  let appId: string;

  beforeAll(async () => {
    [creator, tester] = await Promise.all([member("rizky", "Rizky Ramadhan"), member("ayu", "Ayu Lestari")]);
    appId = await createApp(creator);
  });

  /**
   * An Active cohort holding one assignment of `tester` on a fresh app of `creator`,
   * assigned `days` ago. Assignments are inserted directly so the clock can be set.
   */
  async function slot(days: number, opts: { app?: string } = {}) {
    const app = opts.app ?? (await createApp(creator));
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: app },
      { cohort_id: id, user_id: tester.id },
    ]));
    await forceActive(id, days);
    const assignedAt = ago(days * DAY_MS);
    const assignment = (
      await must(
        service.from("assignments").insert({ cohort_id: id, tester_user_id: tester.id, app_id: app, assigned_at: assignedAt }).select("id").single(),
      )
    ).id as string;
    return { id, app, assignment };
  }

  async function entry(app: string, over: Record<string, unknown> = {}) {
    const row = {
      app_id: app,
      user_id: tester.id,
      display_name: tester.name,
      masked_email: "ay*****@gmail.com",
      opted_in_at: ago(1 * DAY_MS),
      added_by: "self",
      ...over,
    };
    return (await must(service.from("testers").insert(row).select("id").single())).id as string;
  }

  const status = async (assignment: string) =>
    must(anon().from("cohort_assignment_status").select("*").eq("assignment_id", assignment).single()) as Promise<Record<string, unknown>>;
  const obligations = async (cohortId: string, userId = tester.id) =>
    must(anon().from("cohort_obligations").select("*").eq("cohort_id", cohortId).eq("user_id", userId).single()) as Promise<
      Record<string, unknown>
    >;

  it("not joined inside the 48 h window: nothing owed yet", async () => {
    const { id, assignment } = await slot(1);
    expect(await status(assignment)).toMatchObject({ cell: "not_joined", fulfilled: false, behind_on: [], is_behind: false, tester_id: null });
    expect(await obligations(id)).toMatchObject({ assigned_count: 1, opted_in_count: 0, is_behind: false, owes_opt_in: false, all_fulfilled: false });
  });

  it("not joined after 48 h: Behind on opt-in, which drives the Belum tes label", async () => {
    const { id, assignment } = await slot(2.1);
    expect(await status(assignment)).toMatchObject({ cell: "not_joined", behind_on: ["opt_in"], is_behind: true });
    expect(await obligations(id)).toMatchObject({ is_behind: true, owes_opt_in: true });
  });

  it("opted in on Day 3: fulfilled, nothing else due yet", async () => {
    const { id, app, assignment } = await slot(3);
    await entry(app);
    expect(await status(assignment)).toMatchObject({ cell: "opted_in", fulfilled: true, tester_status: "active", behind_on: [] });
    expect(await obligations(id)).toMatchObject({ opted_in_count: 1, all_fulfilled: true, is_behind: false });
  });

  it("an entry from before the cohort counts as fulfilled", async () => {
    const { assignment, app } = await slot(3);
    await entry(app, { opted_in_at: ago(30 * DAY_MS) });
    expect(await status(assignment)).toMatchObject({ fulfilled: true, behind_on: [] });
  });

  it("Day 7 without the used-app check-in or feedback: Behind on both", async () => {
    const { assignment, app } = await slot(7.1);
    await entry(app, { opted_in_at: ago(6 * DAY_MS) });
    expect(await status(assignment)).toMatchObject({ cell: "opted_in", behind_on: ["used_app", "feedback"], is_behind: true });
  });

  it("checked in and sent feedback: the cell moves forward and nothing is owed", async () => {
    const { id, assignment, app } = await slot(8);
    const t = await entry(app, { opted_in_at: ago(7 * DAY_MS), feedback_sent: true, feedback_sent_at: ago(1 * DAY_MS) });
    await must(service.from("check_ins").insert({ tester_id: t, kind: "used_app", created_at: ago(2 * DAY_MS) }));
    expect(await status(assignment)).toMatchObject({ cell: "feedback_sent", behind_on: [] });
    await must(service.from("testers").update({ feedback_verified: true }).eq("id", t));
    expect(await status(assignment)).toMatchObject({ cell: "feedback_verified", feedback_verified: true });
    expect(await obligations(id)).toMatchObject({ used_app_count: 1, feedback_sent_count: 1, feedback_verified_count: 1 });
  });

  it("used the app but no feedback: 'used' cell, Behind on feedback only", async () => {
    const { assignment, app } = await slot(8);
    const t = await entry(app, { opted_in_at: ago(7 * DAY_MS) });
    await must(service.from("check_ins").insert({ tester_id: t, kind: "used_app" }));
    expect(await status(assignment)).toMatchObject({ cell: "used", behind_on: ["feedback"] });
  });

  it("Day 13 without 'Masih opt-in': Behind on it", async () => {
    const { assignment, app } = await slot(13.1);
    const t = await entry(app, { opted_in_at: ago(12 * DAY_MS), feedback_sent: true, feedback_sent_at: ago(5 * DAY_MS) });
    await must(service.from("check_ins").insert({ tester_id: t, kind: "used_app" }));
    expect(await status(assignment)).toMatchObject({ behind_on: ["still_opted_in"] });
    await must(service.from("check_ins").insert({ tester_id: t, kind: "still_opted_in" }));
    expect(await status(assignment)).toMatchObject({ behind_on: [], still_opted_in_at: expect.any(String) });
  });

  it("a build logged after Day 0 is due 72 h later; 'Sudah update' clears it; newer builds are not due yet", async () => {
    const { id, assignment, app } = await slot(5);
    const t = await entry(app, { opted_in_at: ago(5 * DAY_MS) });
    const build = { app_id: app, version_name: "1.1.0", uploaded_at: ago(4 * DAY_MS), changelog: "Perbaiki sinkronisasi" };
    const old = (await must(service.from("builds").insert({ ...build, created_at: ago(4 * DAY_MS) }).select("id").single())).id;
    await must(service.from("builds").insert({ ...build, version_name: "1.1.1", created_at: ago(1 * DAY_MS) }));
    // A build from before Day 0 is never due.
    await must(service.from("builds").insert({ ...build, version_name: "1.0.0", created_at: ago(9 * DAY_MS) }));
    expect(await status(assignment)).toMatchObject({ builds_due_count: 1, builds_updated_count: 0, behind_on: ["updated_build"] });
    await must(service.from("check_ins").insert({ tester_id: t, kind: "updated_build", build_id: old }));
    expect(await status(assignment)).toMatchObject({ builds_due_count: 1, builds_updated_count: 1, behind_on: [] });
    expect(await obligations(id)).toMatchObject({ builds_due_count: 1, builds_updated_count: 1 });
  });

  it("Left before 14 days or Removed: 'left' cell and not fulfilled; Left after 14 days stays fulfilled", async () => {
    const early = await slot(3);
    await entry(early.app, { opted_in_at: ago(3 * DAY_MS), status: "left", left_at: ago(1 * DAY_MS) });
    expect(await status(early.assignment)).toMatchObject({ cell: "left", fulfilled: false, behind_on: ["opt_in"] });

    const removed = await slot(3);
    await entry(removed.app, { opted_in_at: ago(3 * DAY_MS), status: "removed" });
    expect(await status(removed.assignment)).toMatchObject({ cell: "left", fulfilled: false });

    const done = await slot(3);
    await entry(done.app, { opted_in_at: ago(20 * DAY_MS), status: "left", left_at: ago(2 * DAY_MS) });
    expect(await status(done.assignment)).toMatchObject({ fulfilled: true, tester_status: "left" });
  });

  it("a reassigned slot owes nothing and drops out of the member's totals", async () => {
    const { id, assignment, app } = await slot(4);
    const other = await member("bagus", "Bagus Wicaksono");
    await must(service.from("cohort_members").insert({ cohort_id: id, user_id: other.id }));
    const moved = (await must(
      service.from("assignments").insert({ cohort_id: id, tester_user_id: other.id, app_id: app, assigned_at: ago(1 * DAY_MS) }).select("id").single(),
    )).id;
    await must(service.from("assignments").update({ state: "reassigned", reassigned_to: moved }).eq("id", assignment));
    expect(await status(assignment)).toMatchObject({ cell: "reassigned", behind_on: [], is_behind: false });
    expect(await obligations(id)).toMatchObject({ assigned_count: 0, is_behind: false, owes_opt_in: false, all_fulfilled: true });
    // The new holder has their own 48 h window.
    expect(await status(moved)).toMatchObject({ cell: "not_joined", behind_on: [] });
  });

  it("a closed cohort is judged at its close: later milestones and later check-ins never count", async () => {
    const { id, assignment, app } = await slot(10);
    const t = await entry(app, { opted_in_at: ago(9 * DAY_MS) });
    // Closed on Day 6, before the Day 7 milestones fell due.
    await must(service.from("cohorts").update({ status: "closed", closed_at: ago(4 * DAY_MS) }).eq("id", id));
    expect(await status(assignment)).toMatchObject({ behind_on: [] });
    // A check-in after the close is ignored.
    await must(service.from("check_ins").insert({ tester_id: t, kind: "used_app", created_at: ago(1 * DAY_MS) }));
    expect(await status(assignment)).toMatchObject({ used_app_at: null, cell: "opted_in" });
  });

  it("a member with no assignments yet owes nothing", async () => {
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert({ cohort_id: id, user_id: tester.id }));
    expect(await obligations(id)).toMatchObject({ assigned_count: 0, all_fulfilled: true, is_behind: false, owes_opt_in: false, app_id: null });
  });

  it("everyone can read both views; nobody can write them", async () => {
    const { id, assignment } = await slot(1, { app: appId });
    for (const db of [anon(), tester.db, creator.db, admin.db]) {
      expect(await must(db.from("cohort_assignment_status").select("assignment_id").eq("assignment_id", assignment))).toHaveLength(1);
      expect(await must(db.from("cohort_obligations").select("user_id").eq("cohort_id", id))).toHaveLength(2);
      expect((await db.from("cohort_obligations").update({ is_behind: false }).eq("cohort_id", id)).error).not.toBeNull();
      expect((await db.from("cohort_assignment_status").update({ cell: "feedback_verified" }).eq("assignment_id", assignment)).error).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------- check_in

describe("check_in (FR-39–41)", () => {
  let creator: Member;

  beforeAll(async () => {
    creator = await member("dewi", "Dewi Anggraini");
  });

  /** A member who joined a fresh app `days` ago through the normal flow. */
  async function tester(days: number) {
    const m = await member(`tester${uniq()}`, "Sari Dewi");
    const app = await createApp(creator);
    await must(m.db.rpc("join_as_tester", { p_app_id: app, p_checklist: { joinedGroup: true, optedIn: true, installed: true } }));
    await must(service.from("testers").update({ opted_in_at: ago(days * DAY_MS) }).eq("app_id", app).eq("user_id", m.id));
    return { m, app };
  }
  const checkIn = (m: Member, app: string, kind: string, build: string | null = null) =>
    m.db.rpc("check_in", { p_app_id: app, p_kind: kind, p_build_id: build });
  const addBuild = async (app: string, version = "1.0.1") =>
    (await must(creator.db.rpc("add_build", { p_app_id: app, p_version_name: version, p_uploaded_at: ago(HOUR_MS), p_changelog: "Perbaikan" }))) as string;

  it("outside a cohort, windows count from the tester's own opt-in (FR-40)", async () => {
    const young = await tester(4.9);
    await expectCode(checkIn(young.m, young.app, "used_app"), "failed-precondition", /hari ke-5/);
    const { m, app } = await tester(5.1);
    const id = await must(checkIn(m, app, "used_app"));
    expect(id).toEqual(expect.any(String));
    await expectCode(checkIn(m, app, "still_opted_in"), "failed-precondition", /hari ke-12/);
    await expectCode(checkIn(m, app, "used_app"), "already-exists");
    const old = await tester(12.1);
    await must(checkIn(old.m, old.app, "still_opted_in"));
    const rows = await must(anon().from("check_ins").select("kind, build_id"));
    expect(rows).toEqual(expect.arrayContaining([{ kind: "used_app", build_id: null }]));
  });

  it("'Sudah update' needs a build of this app, once per build", async () => {
    const { m, app } = await tester(1);
    const b1 = await addBuild(app);
    await expectCode(checkIn(m, app, "updated_build"), "invalid-argument");
    const elsewhere = await addBuild(await createApp(creator));
    await expectCode(checkIn(m, app, "updated_build", elsewhere), "invalid-argument");
    await must(checkIn(m, app, "updated_build", b1));
    await expectCode(checkIn(m, app, "updated_build", b1), "already-exists");
    await must(checkIn(m, app, "updated_build", await addBuild(app, "1.0.2")));
    await expectCode(checkIn(m, app, "used_app", b1), "invalid-argument");
  });

  it("inside a cohort, windows count from the assignment, even for a long-time tester", async () => {
    const { m, app } = await tester(20);
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: app },
      { cohort_id: id, user_id: m.id },
    ]));
    await forceActive(id, 2);
    const a = (await must(
      service.from("assignments").insert({ cohort_id: id, tester_user_id: m.id, app_id: app, assigned_at: ago(2 * DAY_MS) }).select("id").single(),
    )).id;
    await expectCode(checkIn(m, app, "used_app"), "failed-precondition");
    await must(service.from("assignments").update({ assigned_at: ago(5.2 * DAY_MS) }).eq("id", a));
    await must(checkIn(m, app, "used_app"));
    // Once the cohort is closed, the tester's own opt-in applies again.
    await forceClosed(id);
    await must(checkIn(m, app, "still_opted_in"));
  });

  it("refuses unknown kinds, non-testers, inactive entries, deleted apps and visitors", async () => {
    const { m, app } = await tester(6);
    await expectCode(checkIn(m, app, "opened"), "invalid-argument");
    const stranger = await member("ilham", "Ilham Maulana");
    await expectCode(checkIn(stranger, app, "used_app"), "not-found");
    await expectCode(anon().rpc("check_in", { p_app_id: app, p_kind: "used_app", p_build_id: null }), "unauthenticated");
    await must(m.db.rpc("leave_testing", { p_app_id: app }));
    await expectCode(checkIn(m, app, "used_app"), "failed-precondition");
    const other = await tester(6);
    await must(creator.db.rpc("delete_app", { p_app_id: other.app }));
    await expectCode(checkIn(other.m, other.app, "used_app"), "not-found");
  });
});

// ---------------------------------------------------------------- reassign and close (A7)

describe("reassign_slot and close_cohort (FR-36, FR-37)", () => {
  let creator: Member;
  let creator2: Member;
  let ghost: Member;
  let helper: Member;
  let slacker: Member;

  beforeAll(async () => {
    [creator, creator2, ghost, helper, slacker] = await Promise.all([
      member("indah", "Indah Permatasari"),
      member("teguh", "Teguh Wibowo"),
      member("putu", "Putu Ary Wiradana"),
      member("zaki", "Ahmad Zaki Mubarak"),
      member("anisa", "Anisa Rahmawati"),
    ]);
  });

  const masked = (m: Member) => `${m.email.slice(0, 2)}*****@gmail.com`;
  async function join(m: Member, app: string, optedDaysAgo = 1) {
    await must(service.from("testers").insert({
      app_id: app, user_id: m.id, display_name: m.name, masked_email: masked(m), opted_in_at: ago(optedDaysAgo * DAY_MS), added_by: "self",
    }));
  }

  /**
   * Active cohort, Day `day`: creator brings `app`. `ghost` is assigned it and never joins;
   * `helper` has fulfilled their own slot on `app2`; `slacker` has an open, unfulfilled slot on `app2`.
   */
  async function running(day = 4) {
    const app = await createApp(creator);
    const app2 = await createApp(creator2);
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: app },
      { cohort_id: id, user_id: creator2.id, app_id: app2 },
      { cohort_id: id, user_id: ghost.id },
      { cohort_id: id, user_id: helper.id },
      { cohort_id: id, user_id: slacker.id },
    ]));
    await forceActive(id, day);
    const at = ago(day * DAY_MS);
    const insert = async (user: string, appId: string) =>
      (await must(service.from("assignments").insert({ cohort_id: id, tester_user_id: user, app_id: appId, assigned_at: at }).select("id").single())).id as string;
    const ghostSlot = await insert(ghost.id, app);
    await insert(helper.id, app2);
    await join(helper, app2, day);
    const slackerSlot = await insert(slacker.id, app2);
    return { id, app, app2, ghostSlot, slackerSlot };
  }
  const reassign = (db: Member["db"], assignment: string, to: string) =>
    db.rpc("reassign_slot", { p_assignment_id: assignment, p_to_user_id: to });

  it("moves an unfulfilled slot to a member who fulfilled all of theirs", async () => {
    const { id, app, ghostSlot } = await running();
    const moved = (await must(reassign(admin.db, ghostSlot, helper.id))) as string;
    const rows = await must(anon().from("assignments").select("id, tester_user_id, app_id, state, reassigned_to, assigned_at").eq("cohort_id", id));
    expect(rows.find((r) => r.id === ghostSlot)).toMatchObject({ state: "reassigned", reassigned_to: moved });
    const fresh = rows.find((r) => r.id === moved)!;
    expect(fresh).toMatchObject({ tester_user_id: helper.id, app_id: app, state: "open", reassigned_to: null });
    expect(Date.now() - Date.parse(fresh.assigned_at as string)).toBeLessThan(60_000);
    const o = await must(anon().from("cohort_obligations").select("assigned_count, is_behind").eq("cohort_id", id).eq("user_id", ghost.id).single());
    expect(o).toEqual({ assigned_count: 0, is_behind: false });
  });

  it("refuses moved or fulfilled slots, bad targets, the wrong status and non-admins", async () => {
    const { id, app, ghostSlot, slackerSlot } = await running();
    await expectCode(reassign(creator.db, ghostSlot, helper.id), "permission-denied");
    await expectCode(reassign(admin.db, randomUUID(), helper.id), "not-found");
    const outsider = await member("ketut", "Ketut Arsana");
    await expectCode(reassign(admin.db, ghostSlot, outsider.id), "not-found");
    await expectCode(reassign(admin.db, ghostSlot, ghost.id), "invalid-argument");
    await expectCode(reassign(admin.db, ghostSlot, creator.id), "invalid-argument", /aplikasinya sendiri/);
    await expectCode(reassign(admin.db, ghostSlot, slacker.id), "failed-precondition", /belum memenuhi/);
    // creator2 has no assignments, so "all fulfilled", but is already assigned this app after a first move.
    const moved = (await must(reassign(admin.db, ghostSlot, creator2.id))) as string;
    await expectCode(reassign(admin.db, ghostSlot, helper.id), "failed-precondition", /sudah dipindahkan/);
    await must(service.from("assignments").update({ state: "reassigned", reassigned_to: moved }).eq("id", slackerSlot));
    await expectCode(reassign(admin.db, moved, creator2.id), "invalid-argument");
    // A fulfilled slot does not need moving.
    await join(creator2, app);
    await expectCode(reassign(admin.db, moved, helper.id), "failed-precondition", /sudah dipenuhi/);
    // Only while Active.
    await forceClosed(id);
    await expectCode(reassign(admin.db, moved, helper.id), "failed-precondition");
  });

  it("refuses a target already assigned that app", async () => {
    const { app2, slackerSlot, id } = await running();
    // helper already holds a slot on app2.
    expect((await must(anon().from("assignments").select("id").eq("cohort_id", id).eq("tester_user_id", helper.id).eq("app_id", app2))).length).toBe(1);
    await expectCode(reassign(admin.db, slackerSlot, helper.id), "already-exists");
  });

  it("before Day 21, closes only when every app is Ready to apply", async () => {
    const { id, app, app2 } = await running(5);
    await expectCode(admin.db.rpc("close_cohort", { p_cohort_id: id }), "failed-precondition", /hari ke-21/);
    // 12 testers past 14 days on both apps (manual entries).
    for (const a of [app, app2]) {
      await must(service.from("testers").insert(range(12).map((i) => ({
        app_id: a, display_name: `Tester ${i}`, masked_email: "te*****@gmail.com", opted_in_at: ago(15 * DAY_MS), added_by: "creator",
      }))));
    }
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
    const c = await must(anon().from("cohorts").select("status, closed_at").eq("id", id).single());
    expect(c.status).toBe("closed");
    expect(c.closed_at).not.toBeNull();
  });

  it("from Day 21 closes anyway and sets Good or Owing per member", async () => {
    const { id } = await running(21.1);
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
    const rows = await must(anon().from("cohort_members").select("user_id, standing").eq("cohort_id", id));
    const standing = new Map(rows.map((r) => [r.user_id, r.standing]));
    expect(standing.get(ghost.id)).toBe("owing");
    expect(standing.get(slacker.id)).toBe("owing");
    // helper opted in but never checked in or sent feedback: Behind on Day 7 and 13 milestones.
    expect(standing.get(helper.id)).toBe("owing");
    // Creators with no assignments owe nothing.
    expect(standing.get(creator.id)).toBe("good");
    expect(standing.get(creator2.id)).toBe("good");
  });

  it("a member who met every milestone is Good", async () => {
    const { id, app2 } = await running(21.1);
    const entry = (await must(service.from("testers").select("id").eq("app_id", app2).eq("user_id", helper.id).single())).id;
    await must(service.from("testers").update({ feedback_sent: true, feedback_sent_at: ago(10 * DAY_MS) }).eq("id", entry));
    await must(service.from("check_ins").insert([
      { tester_id: entry, kind: "used_app", created_at: ago(15 * DAY_MS) },
      { tester_id: entry, kind: "still_opted_in", created_at: ago(8 * DAY_MS) },
    ]));
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
    const row = await must(anon().from("cohort_members").select("standing").eq("cohort_id", id).eq("user_id", helper.id).single());
    expect(row.standing).toBe("good");
  });

  it("a slot on an app deleted during the cohort never makes anyone Owing", async () => {
    const { id, app } = await running(21.1);
    await must(service.from("assignments").delete().eq("cohort_id", id).neq("tester_user_id", ghost.id));
    await must(creator.db.rpc("delete_app", { p_app_id: app }));
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
    const row = await must(anon().from("cohort_members").select("standing").eq("cohort_id", id).eq("user_id", ghost.id).single());
    expect(row.standing).toBe("good");
  });

  it("refuses Forming or Closed cohorts and non-admins; an Owing member is then blocked", async () => {
    const { id } = await running(21.1);
    await expectCode(creator.db.rpc("close_cohort", { p_cohort_id: id }), "permission-denied");
    await expectCode(admin.db.rpc("close_cohort", { p_cohort_id: randomUUID() }), "not-found");
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
    await expectCode(admin.db.rpc("close_cohort", { p_cohort_id: id }), "failed-precondition");
    const forming = await createCohort(admin);
    await expectCode(admin.db.rpc("close_cohort", { p_cohort_id: forming }), "failed-precondition");
    await expectCode(ghost.db.rpc("join_cohort_as_tester", { p_cohort_id: forming }), "failed-precondition", /Owing/);
  });
});

// ---------------------------------------------------------------- owner decisions 2026-11-03

describe("re-joining and the Anda copy", () => {
  it("re-joining after Left clears the entry's check-ins; the windows start again", async () => {
    const creator = await member("hendra", "Hendra Gunawan");
    const m = await member("lukman", "Lukman Hakim");
    const app = await createApp(creator);
    const list = { joinedGroup: true, optedIn: true, installed: true };
    await must(m.db.rpc("join_as_tester", { p_app_id: app, p_checklist: list }));
    const entry = (await must(service.from("testers").select("id").eq("app_id", app).eq("user_id", m.id).single())).id;
    await must(service.from("testers").update({ opted_in_at: ago(6 * DAY_MS) }).eq("id", entry));
    await must(m.db.rpc("check_in", { p_app_id: app, p_kind: "used_app", p_build_id: null }));
    await must(m.db.rpc("leave_testing", { p_app_id: app }));
    await must(m.db.rpc("join_as_tester", { p_app_id: app, p_checklist: list }));
    expect(await must(anon().from("check_ins").select("id").eq("tester_id", entry))).toHaveLength(0);
    await expectCode(m.db.rpc("check_in", { p_app_id: app, p_kind: "used_app", p_build_id: null }), "failed-precondition");
  });

  it("server messages address the member as Anda", async () => {
    const creator = await member("bagus", "Bagus Wicaksono");
    const m = await member("rudi", "Rudi Hartono");
    const app = await createApp(creator);
    const list = { joinedGroup: true, optedIn: true, installed: true };
    await expectCode(creator.db.rpc("join_as_tester", { p_app_id: app, p_checklist: list }), "permission-denied", /^Anda tidak bisa jadi tester untuk aplikasi Anda sendiri\.$/);
    await expectCode(m.db.rpc("leave_testing", { p_app_id: app }), "not-found", /^Anda belum terdaftar/);
    await must(m.db.rpc("join_as_tester", { p_app_id: app, p_checklist: list }));
    await expectCode(m.db.rpc("join_as_tester", { p_app_id: app, p_checklist: list }), "already-exists", /^Anda sudah terdaftar/);
    await expectCode(m.db.rpc("check_in", { p_app_id: app, p_kind: "updated_build", p_build_id: null }), "invalid-argument", /Anda pasang/);
    const left = await createCohort(admin);
    await expectCode(m.db.rpc("leave_cohort", { p_cohort_id: left }), "not-found", /^Anda bukan anggota/);
  });
});
