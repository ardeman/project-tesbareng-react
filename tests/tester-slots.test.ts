// ADR-012 tester slots: create_app / update_app take p_tester_slots (1–12), cohort
// demand kᵢ = min(slotsᵢ + 2, N − 1) with give = take, pure testers balanced against kᵢ,
// and Ready to apply = eligible ≥ tester_slots in close_cohort and due_reminders.
// Contract: docs/contract.md.
import { beforeAll, describe, expect, it } from "vitest";
import {
  ago,
  anon,
  appInput,
  createApp,
  createCohort,
  DAY_MS,
  expectCode,
  forceActive,
  member,
  must,
  service,
  type Member,
} from "./helpers";

let admin: Member;
let creator: Member;

beforeAll(async () => {
  [admin, creator] = await Promise.all([member("yusuf", "Yusuf Hidayat", "admin"), member("sari", "Sari Wulandari")]);
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const slotsOf = async (id: string) => (await must(anon().from("apps").select("tester_slots").eq("id", id).single())).tester_slots as number;

const editArgs = (id: string, over: Record<string, unknown> = {}) => {
  const { p_group_confirmed: _g, ...rest } = appInput();
  return { ...rest, p_app_id: id, ...over };
};

describe("create_app / update_app tester slots", () => {
  it("defaults to 12 and takes 1–12", async () => {
    expect(await slotsOf(await createApp(creator))).toBe(12);
    expect(await slotsOf(await createApp(creator, { p_tester_slots: 3 }))).toBe(3);
    expect(await slotsOf(await createApp(creator, { p_tester_slots: 1 }))).toBe(1);
  });

  it.each([0, 13, -1])("refuses %i slots", async (n) => {
    await expectCode(creator.db.rpc("create_app", appInput({ p_tester_slots: n })), "invalid-argument", /1 sampai 12/);
  });

  it("update_app changes the slots; null keeps them", async () => {
    const id = await createApp(creator, { p_tester_slots: 5 });
    await must(creator.db.rpc("update_app", editArgs(id, { p_tester_slots: 9 })));
    expect(await slotsOf(id)).toBe(9);
    await must(creator.db.rpc("update_app", editArgs(id)));
    expect(await slotsOf(id)).toBe(9);
    await expectCode(creator.db.rpc("update_app", editArgs(id, { p_tester_slots: 13 })), "invalid-argument");
  });

  it("only the creator or an admin changes them, never by a direct write", async () => {
    const id = await createApp(creator, { p_tester_slots: 4 });
    const other = await member("dimas", "Dimas Pratama");
    await expectCode(other.db.rpc("update_app", editArgs(id, { p_tester_slots: 12 })), "permission-denied");
    await other.db.from("apps").update({ tester_slots: 12 }).eq("id", id);
    await creator.db.from("apps").update({ tester_slots: 12 }).eq("id", id);
    expect(await slotsOf(id)).toBe(4);
    await must(admin.db.rpc("update_app", editArgs(id, { p_tester_slots: 6 })));
    expect(await slotsOf(id)).toBe(6);
  });
});

type Assignment = { tester_user_id: string; app_id: string };
const countBy = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());

/** A Forming cohort whose i-th creator brings one app with slots[i], plus `nPure` pure testers. */
async function cohortWith(slots: number[], nPure = 0) {
  const id = await createCohort(admin);
  const creators = await Promise.all(slots.map((_, i) => member(`slot${i}`, `Kreator Slot ${i}`)));
  const apps = await Promise.all(creators.map((c, i) => createApp(c, { p_tester_slots: slots[i] })));
  const pures = await Promise.all(range(nPure).map((i) => member(`slotmurni${i}`, `Tester Murni ${i}`)));
  await Promise.all(
    creators.map((c, i) => must(admin.db.rpc("add_cohort_member", { p_cohort_id: id, p_user_id: c.id, p_app_id: apps[i] }))),
  );
  await Promise.all(pures.map((p) => must(admin.db.rpc("add_cohort_member", { p_cohort_id: id, p_user_id: p.id, p_app_id: null }))));
  await must(admin.db.rpc("start_cohort", { p_cohort_id: id }));
  const rows = (await must(anon().from("assignments").select("tester_user_id, app_id").eq("cohort_id", id))) as Assignment[];
  const members = await must(anon().from("cohort_members").select("user_id, app_id, demand").eq("cohort_id", id));
  return { id, creators, apps, pures, rows, members };
}

/** Every creator tests exactly their demand, every app receives exactly it from creators, no self or duplicate. */
function expectGiveEqualsTake(
  { creators, apps, rows, members }: Awaited<ReturnType<typeof cohortWith>>,
): Map<string, number> {
  const creatorIds = new Set(creators.map((c) => c.id));
  const fromCreators = rows.filter((r) => creatorIds.has(r.tester_user_id));
  const gives = countBy(fromCreators.map((r) => r.tester_user_id));
  const takes = countBy(fromCreators.map((r) => r.app_id));
  const demand = new Map(members.map((m) => [m.user_id as string, m.demand as number | null]));
  for (const [i, c] of creators.entries()) {
    expect(gives.get(c.id)).toBe(demand.get(c.id));
    expect(takes.get(apps[i])).toBe(demand.get(c.id));
    expect(fromCreators.some((r) => r.tester_user_id === c.id && r.app_id === apps[i])).toBe(false);
  }
  expect(new Set(rows.map((r) => `${r.tester_user_id}/${r.app_id}`)).size).toBe(rows.length);
  return new Map(creators.map((c) => [c.id, demand.get(c.id)!]));
}

describe("start_cohort demand kᵢ (ADR-012 §5)", () => {
  it("N = 16, all 12 slots: k = 14 for everyone (ADR-007 gave the full mesh of 15 here)", async () => {
    const r = await cohortWith(range(16).map(() => 12));
    for (const k of expectGiveEqualsTake(r).values()) expect(k).toBe(14);
  });

  it("N = 13, one app at 12 and the rest at 1: k = 12 and 3, exactly", async () => {
    const r = await cohortWith([12, ...range(12).map(() => 1)]);
    const k = expectGiveEqualsTake(r);
    expect(k.get(r.creators[0].id)).toBe(12);
    for (const c of r.creators.slice(1)) expect(k.get(c.id)).toBe(3);
  });

  it("N = 17, mixed slots: each creator gives and takes min(slots + 2, 16)", async () => {
    const slots = [12, 12, 12, 10, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1];
    const r = await cohortWith(slots);
    const k = expectGiveEqualsTake(r);
    for (const [i, c] of r.creators.entries()) expect(k.get(c.id)).toBe(Math.min(slots[i] + 2, 16));
  });

  it("an unassignable mix raises the smallest kᵢ until it works; every app still gets at least its demand", async () => {
    // Four apps at k = 12 need all 12 others, so the nine at k = 3 must test at least 4.
    const slots = [12, 12, 12, 12, ...range(9).map(() => 1)];
    const r = await cohortWith(slots);
    const k = expectGiveEqualsTake(r);
    for (const [i, c] of r.creators.entries()) {
      expect(k.get(c.id)!).toBeGreaterThanOrEqual(Math.min(slots[i] + 2, 12));
      expect(k.get(c.id)!).toBeLessThanOrEqual(12);
    }
    for (const c of r.creators.slice(4)) expect(k.get(c.id)).toBeGreaterThanOrEqual(4);
  });

  it("pure testers go to the apps with the lowest coverage relative to kᵢ", async () => {
    // 8 apps at k = 14 and 9 at k = 3. Counting raw coverage would send pure testers to the
    // small apps first; relative to kᵢ, every big app gets at least 2 of the 3.
    const r = await cohortWith([...range(8).map(() => 12), ...range(9).map(() => 1)], 3);
    expectGiveEqualsTake(r);
    const pureIds = new Set(r.pures.map((p) => p.id));
    const pureRows = r.rows.filter((x) => pureIds.has(x.tester_user_id));
    for (const count of countBy(pureRows.map((x) => x.tester_user_id)).values()) expect(count).toBe(14);
    const perApp = countBy(pureRows.map((x) => x.app_id));
    for (const app of r.apps.slice(0, 8)) expect(perApp.get(app) ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("changing slots after Day 0 does not move assignments", async () => {
    const r = await cohortWith(range(13).map(() => 12));
    const app = r.apps[0];
    await must(r.creators[0].db.rpc("update_app", editArgs(app, { p_tester_slots: 2 })));
    const after = (await must(anon().from("assignments").select("tester_user_id, app_id").eq("cohort_id", r.id))) as Assignment[];
    expect(after).toHaveLength(r.rows.length);
  });
});

const eligibleTesters = (app: string, n: number) =>
  must(service.from("testers").insert(range(n).map((i) => ({
    app_id: app, display_name: `Tester ${i}`, masked_email: "te*****@gmail.com", opted_in_at: ago(15 * DAY_MS), added_by: "creator",
  }))));

describe("Ready to apply = eligible ≥ tester_slots", () => {
  it("close_cohort before Day 21 uses each app's slots", async () => {
    const owner2 = await member("bayu", "Bayu Saputra");
    const [a1, a2] = await Promise.all([createApp(creator, { p_tester_slots: 3 }), createApp(owner2, { p_tester_slots: 12 })]);
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: a1 },
      { cohort_id: id, user_id: owner2.id, app_id: a2 },
    ]));
    await forceActive(id, 5);
    await eligibleTesters(a1, 3);
    await eligibleTesters(a2, 3);
    await expectCode(admin.db.rpc("close_cohort", { p_cohort_id: id }), "failed-precondition", /hari ke-21/);
    await must(owner2.db.rpc("update_app", editArgs(a2, { p_tester_slots: 3 })));
    await must(admin.db.rpc("close_cohort", { p_cohort_id: id }));
  });

  it("due_reminders app_eligible fires at the slot count", async () => {
    const app = await createApp(creator, { p_tester_slots: 4 });
    const eligible = async () =>
      ((await must(service.rpc("due_reminders"))) as { kind: string; ref_id: string }[]).filter((x) => x.kind === "app_eligible" && x.ref_id === app);
    await eligibleTesters(app, 3);
    expect(await eligible()).toHaveLength(0);
    await eligibleTesters(app, 1);
    expect(await eligible()).toHaveLength(1);
  });
});
