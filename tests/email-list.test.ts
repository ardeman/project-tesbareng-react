// Email-list testing (ADR-011): the tester method on apps, the four email-list RPCs,
// join_as_tester for email-list apps, and cohort milestones counted from base_at.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ago,
  anon,
  appInput,
  checklist,
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

let creator: Member;
let tester: Member;
let other: Member;
let admin: Member;

beforeAll(async () => {
  [creator, tester, other, admin] = await Promise.all([
    member("rina.wulandari", "Rina Wulandari"),
    member("dimas.pratama", "Dimas Pratama"),
    member("sari", "Sari Indah"),
    member("yusuf", "Yusuf Hidayat", "admin"),
  ]);
});

const emailApp = (m: Member = creator) => createApp(m, { p_tester_method: "email_list", p_group_confirmed: false });
const request = (m: Member, appId: string, consent: unknown = true) =>
  m.db.rpc("request_email_listing", { p_app_id: appId, p_consent: consent });
const listings = (m: Member, appId: string) => m.db.rpc("app_email_listings", { p_app_id: appId });
const markListed = (m: Member, appId: string, userId: string, listed = true) =>
  m.db.rpc("mark_email_listed", { p_app_id: appId, p_user_id: userId, p_listed: listed });
const optedIn = { optedIn: true, installed: true };

describe("create_app / update_app tester method", () => {
  it("defaults to google_group and still requires the group confirmation", async () => {
    const id = await createApp(creator);
    const a = await must(anon().from("apps").select("tester_method").eq("id", id).single());
    expect(a.tester_method).toBe("google_group");
    await expectCode(creator.db.rpc("create_app", appInput({ p_group_confirmed: false })), "invalid-argument", /googlegroups/);
  });

  it("an email-list app needs no group confirmation", async () => {
    const id = await emailApp();
    const a = await must(anon().from("apps").select("tester_method").eq("id", id).single());
    expect(a.tester_method).toBe("email_list");
  });

  it("rejects an unknown method", async () => {
    await expectCode(creator.db.rpc("create_app", appInput({ p_tester_method: "csv" })), "invalid-argument");
  });

  it("update_app keeps the method when null and switches it when given", async () => {
    const id = await emailApp();
    const base = { p_app_id: id, p_name: "Kasir Warung", p_description: "Aplikasi kasir sederhana.", p_opt_in_url: `https://play.google.com/apps/testing/id.kasir${randomUUID().slice(0, 6)}` };
    await must(creator.db.rpc("update_app", base));
    expect((await must(anon().from("apps").select("tester_method").eq("id", id).single())).tester_method).toBe("email_list");
    await must(creator.db.rpc("update_app", { ...base, p_tester_method: "google_group" }));
    expect((await must(anon().from("apps").select("tester_method").eq("id", id).single())).tester_method).toBe("google_group");
    await expectCode(creator.db.rpc("update_app", { ...base, p_tester_method: "csv" }), "invalid-argument");
  });
});

describe("request_email_listing / cancel_email_listing", () => {
  it("needs consent, a live email-list app, not your own, and a session", async () => {
    const app = await emailApp();
    await expectCode(request(tester, app, false), "invalid-argument", /persetujuan/);
    await expectCode(request(tester, app, null), "invalid-argument");
    await expectCode(request(tester, await createApp(creator)), "failed-precondition", /Google Group/);
    await expectCode(request(creator, app), "permission-denied");
    await expectCode(request(tester, randomUUID()), "not-found");
    await expectCode(anon().rpc("request_email_listing", { p_app_id: app, p_consent: true }), "unauthenticated");
  });

  it("is idempotent and public rows carry no email", async () => {
    const app = await emailApp();
    await must(request(tester, app));
    await must(request(tester, app));
    const rows = await must(anon().from("email_listings").select("*").eq("app_id", app));
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["app_id", "listed_at", "requested_at", "user_id"]);
  });

  it("a removed tester cannot ask again", async () => {
    const app = await emailApp();
    await must(service.from("testers").insert({
      app_id: app, user_id: other.id, display_name: other.name, masked_email: "sa*****@gmail.com",
      opted_in_at: ago(DAY_MS), added_by: "self", status: "removed",
    }));
    await expectCode(request(other, app), "permission-denied");
  });

  it("the tester can withdraw; withdrawing twice is not-found", async () => {
    const app = await emailApp();
    await must(request(tester, app));
    await must(tester.db.rpc("cancel_email_listing", { p_app_id: app }));
    expect(await must(anon().from("email_listings").select("*").eq("app_id", app))).toHaveLength(0);
    await expectCode(tester.db.rpc("cancel_email_listing", { p_app_id: app }), "not-found");
  });
});

describe("app_email_listings (full emails)", () => {
  it("returns full emails to the creator only", async () => {
    const app = await emailApp();
    await must(request(tester, app));
    const rows = (await must(listings(creator, app))) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: tester.id, display_name: tester.name, email: tester.email, listed_at: null });

    await expectCode(listings(tester, app), "permission-denied");
    await expectCode(listings(other, app), "permission-denied");
    await expectCode(listings(admin, app), "permission-denied");
    await expectCode(anon().rpc("app_email_listings", { p_app_id: app }), "unauthenticated");
  });

  it("drops members who withdrew, left or were removed", async () => {
    const app = await emailApp();
    await must(request(tester, app));
    await must(request(other, app));
    await must(markListed(creator, app, tester.id));
    await must(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: optedIn }));
    await must(tester.db.rpc("leave_testing", { p_app_id: app }));
    await must(other.db.rpc("cancel_email_listing", { p_app_id: app }));
    expect(await must(listings(creator, app))).toEqual([]);
  });
});

describe("mark_email_listed", () => {
  it("creator or admin marks and unmarks; others are denied", async () => {
    const app = await emailApp();
    await must(request(tester, app));
    await expectCode(markListed(tester, app, tester.id), "permission-denied");
    await expectCode(markListed(other, app, tester.id), "permission-denied");
    await must(markListed(admin, app, tester.id));
    const first = (await must(anon().from("email_listings").select("listed_at").eq("app_id", app).single())).listed_at;
    expect(first).not.toBeNull();
    await must(markListed(creator, app, tester.id)); // keeps the first time
    expect((await must(anon().from("email_listings").select("listed_at").eq("app_id", app).single())).listed_at).toBe(first);
    await must(markListed(creator, app, tester.id, false));
    expect((await must(anon().from("email_listings").select("listed_at").eq("app_id", app).single())).listed_at).toBeNull();
    await expectCode(markListed(creator, app, other.id), "not-found");
  });
});

describe("join_as_tester on an email-list app", () => {
  it("waits for the creator, then needs no group step", async () => {
    const app = await emailApp();
    await expectCode(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: optedIn }), "failed-precondition", /belum menambahkan/);
    await must(request(tester, app));
    await expectCode(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: optedIn }), "failed-precondition");
    await must(markListed(creator, app, tester.id));
    await expectCode(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: { optedIn: true } }), "invalid-argument");
    await must(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: optedIn }));
  });

  it("a Google Group app still needs the group step", async () => {
    const app = await createApp(creator);
    await expectCode(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: optedIn }), "invalid-argument", /gabung grup/);
    await must(tester.db.rpc("join_as_tester", { p_app_id: app, p_checklist: checklist }));
  });
});

describe("cohort milestones on an email-list app (base_at)", () => {
  async function slot(days: number) {
    const app = await emailApp();
    const id = await createCohort(admin);
    await must(service.from("cohort_members").insert([
      { cohort_id: id, user_id: creator.id, app_id: app },
      { cohort_id: id, user_id: tester.id },
    ]));
    await forceActive(id, days);
    const assignment = (
      await must(service.from("assignments").insert({ cohort_id: id, tester_user_id: tester.id, app_id: app, assigned_at: ago(days * DAY_MS) }).select("id").single())
    ).id as string;
    return { app, assignment };
  }
  const status = async (assignment: string) =>
    must(anon().from("cohort_assignment_status").select("base_at, behind_on, assigned_at").eq("assignment_id", assignment).single()) as Promise<{
      base_at: string | null; behind_on: string[]; assigned_at: string;
    }>;
  const setListing = (app: string, requestedDaysAgo: number, listedDaysAgo: number | null) =>
    must(service.from("email_listings").insert({
      app_id: app, user_id: tester.id, requested_at: ago(requestedDaysAgo * DAY_MS),
      listed_at: listedDaysAgo === null ? null : ago(listedDaysAgo * DAY_MS),
    }));

  it("no request: counts from the assignment, Behind after 48 h", async () => {
    const { assignment } = await slot(3);
    const s = await status(assignment);
    expect(new Date(s.base_at!).getTime()).toBe(new Date(s.assigned_at).getTime());
    expect(s.behind_on).toContain("opt_in");
  });

  it("asked in time, not yet added: nothing is due", async () => {
    const { app, assignment } = await slot(5);
    await setListing(app, 4.5, null);
    const s = await status(assignment);
    expect(s.base_at).toBeNull();
    expect(s.behind_on).toEqual([]);
  });

  it("added later: the 48 h start when the creator marked it", async () => {
    const { app, assignment } = await slot(5);
    await setListing(app, 4.5, 1);
    const s = await status(assignment);
    expect(new Date(s.base_at!).getTime()).toBeGreaterThan(new Date(s.assigned_at).getTime());
    expect(s.behind_on).toEqual([]);
  });

  it("asked after the 48 h window: stays Behind", async () => {
    const { app, assignment } = await slot(5);
    await setListing(app, 1, null);
    expect((await status(assignment)).behind_on).toContain("opt_in");
  });
});
