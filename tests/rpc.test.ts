// Every RPC with its validation, permissions, error codes and rate limits.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  anon,
  appInput,
  checklist,
  createApp,
  DAY_MS,
  entryOf,
  expectCode,
  member,
  must,
  profileStats,
  service,
  stats,
  uniq,
  type Member,
} from "./helpers";

let creator: Member;
let tester: Member;
let other: Member;
let admin: Member;

beforeAll(async () => {
  [creator, tester, other, admin] = await Promise.all([
    member("fajar.nugroho", "Fajar Nugroho"),
    member("ayu.lestari", "Ayu Lestari"),
    member("ab", "Abdul Basith"),
    member("yusuf", "Yusuf Hidayat", "admin"),
  ]);
});

const join = (m: Member, appId: string, list: Record<string, unknown> = checklist) =>
  m.db.rpc("join_as_tester", { p_app_id: appId, p_checklist: list });

describe("ensure_profile", () => {
  it("the auth trigger creates a public profile with only the masked email", async () => {
    const p = await must(anon().from("profiles").select("*").eq("id", other.id).single());
    expect(p).toMatchObject({ display_name: "Abdul Basith", role: "member", masked_email: "ab*****@gmail.com" });
    expect(JSON.stringify(p)).not.toContain(other.email);
  });

  it("returns the caller id, is idempotent and keeps the role", async () => {
    expect(await must(admin.db.rpc("ensure_profile"))).toBe(admin.id);
    await must(admin.db.rpc("ensure_profile"));
    const p = await must(service.from("profiles").select("role").eq("id", admin.id).single());
    expect(p.role).toBe("admin");
  });

  it("refreshes name and photo from the Google identity", async () => {
    const m = await member("lukman", "Lukman Hakim");
    await service.auth.admin.updateUserById(m.id, { user_metadata: { full_name: "Lukman H.", avatar_url: "https://lh3.googleusercontent.com/a/new" } });
    await must(m.db.rpc("ensure_profile"));
    const p = await must(anon().from("profiles").select("display_name, photo_url").eq("id", m.id).single());
    expect(p).toEqual({ display_name: "Lukman H.", photo_url: "https://lh3.googleusercontent.com/a/new" });
  });

  it("requires auth", async () => {
    await expectCode(anon().rpc("ensure_profile"), "unauthenticated");
  });
});

describe("create_app", () => {
  it("creates a recruiting app with zeroed stats", async () => {
    const appId = await createApp(creator);
    const app = await must(anon().from("apps").select("*").eq("id", appId).single());
    expect(app).toMatchObject({ status: "recruiting", creator_id: creator.id, deleted: false, name: "Jadwal Sholat Widget" });
    expect(await stats(appId)).toMatchObject({ active_tester_count: 0, build_count: 0 });
  });

  it("trims fields, stores empty optional fields as null, parses the start date", async () => {
    const appId = await createApp(creator, {
      p_name: "  Kas RT Digital  ",
      p_store_url: "",
      p_package_name: "  ",
      p_feedback_guide: null,
      p_test_start_date: "2026-10-20",
    });
    const app = await must(anon().from("apps").select("*").eq("id", appId).single());
    expect(app).toMatchObject({ name: "Kas RT Digital", store_url: null, package_name: null, feedback_guide: null, test_start_date: "2026-10-20" });
  });

  it("requires group_confirmed === true", async () => {
    await expectCode(creator.db.rpc("create_app", appInput({ p_group_confirmed: false })), "invalid-argument", /googlegroups/);
    await expectCode(creator.db.rpc("create_app", appInput({ p_group_confirmed: null })), "invalid-argument");
  });

  it("enforces length limits at the boundary", async () => {
    await createApp(creator, { p_name: "x".repeat(50), p_description: "x".repeat(280), p_feedback_guide: "x".repeat(500) });
    await expectCode(creator.db.rpc("create_app", appInput({ p_name: "x".repeat(51) })), "invalid-argument", /50/);
    await expectCode(creator.db.rpc("create_app", appInput({ p_description: "x".repeat(281) })), "invalid-argument", /280/);
    await expectCode(creator.db.rpc("create_app", appInput({ p_feedback_guide: "x".repeat(501) })), "invalid-argument", /500/);
  });

  it("requires name and description", async () => {
    await expectCode(creator.db.rpc("create_app", appInput({ p_name: "   " })), "invalid-argument", /wajib/);
    await expectCode(creator.db.rpc("create_app", appInput({ p_description: null })), "invalid-argument", /wajib/);
  });

  it.each([
    "http://play.google.com/apps/testing/id.a.b",
    "https://play.google.com/store/apps/details?id=id.a.b",
    "https://play.google.com/apps/testing/",
    "https://evil.example/apps/testing/id.a.b",
    "https://play.google.com/apps/testing/id.a.b extra",
  ])("rejects opt-in URL %s", async (url) => {
    await expectCode(other.db.rpc("create_app", appInput({ p_opt_in_url: url })), "invalid-argument", /opt-in/);
  });

  it("rejects a store URL outside the Play Store", async () => {
    await expectCode(other.db.rpc("create_app", appInput({ p_store_url: "https://apkpure.com/kasrt" })), "invalid-argument", /Play Store/);
  });

  it.each(["kasrt", "1id.dev.app", "id..app", "id.dev-app.x"])("rejects package name %s", async (pkg) => {
    await expectCode(other.db.rpc("create_app", appInput({ p_package_name: pkg })), "invalid-argument", /paket/);
  });

  it("rejects malformed dates", async () => {
    await expectCode(other.db.rpc("create_app", appInput({ p_test_start_date: "31/10/2026" })), "invalid-argument", /tanggal/i);
    await expectCode(other.db.rpc("create_app", appInput({ p_test_start_date: "2026-13-45" })), "invalid-argument");
  });

  it("rejects a duplicate package name of a live app, allows reuse after delete", async () => {
    const pkg = `id.fajardev.kembar${uniq()}`;
    const first = await createApp(creator, { p_package_name: pkg });
    await expectCode(other.db.rpc("create_app", appInput({ p_package_name: pkg })), "already-exists");
    await must(creator.db.rpc("delete_app", { p_app_id: first }));
    await createApp(other, { p_package_name: pkg });
  });

  it("limits to 5 apps per member per rolling 24 h", async () => {
    const m = await member("rajin", "Member Rajin");
    for (let i = 0; i < 5; i++) await must(m.db.rpc("create_app", appInput()));
    await expectCode(m.db.rpc("create_app", appInput()), "resource-exhausted", /5 aplikasi/);
    // Apps older than 24 h no longer count.
    await must(service.from("apps").update({ created_at: new Date(Date.now() - DAY_MS - 60_000).toISOString() }).eq("creator_id", m.id));
    await must(m.db.rpc("create_app", appInput()));
  });

  it("requires auth", async () => {
    await expectCode(anon().rpc("create_app", appInput()), "unauthenticated");
  });
});

describe("update_app, delete_app, restore_app", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
  });
  const edit = (over: Record<string, unknown> = {}) => ({
    p_app_id: appId,
    p_name: "Kas RT Plus",
    p_description: "Catat iuran warga dan pengeluaran RT.",
    p_opt_in_url: "https://play.google.com/apps/testing/id.rinadev.kasrt",
    p_store_url: "https://play.google.com/store/apps/details?id=id.rinadev.kasrt",
    p_package_name: `id.rinadev.kasrt${uniq()}`,
    p_test_start_date: "2026-10-25",
    p_feedback_guide: "Coba tambah 20 transaksi, apakah grafiknya tetap terbaca?",
    p_status: "testing",
    ...over,
  });

  it("creator can edit the editable fields", async () => {
    await must(creator.db.rpc("update_app", edit()));
    const app = await must(anon().from("apps").select("*").eq("id", appId).single());
    expect(app).toMatchObject({ name: "Kas RT Plus", status: "testing", test_start_date: "2026-10-25", creator_id: creator.id });
    expect(new Date(app.updated_at).getTime()).toBeGreaterThan(new Date(app.created_at).getTime());
  });

  it("status is optional and kept when omitted", async () => {
    await must(creator.db.rpc("update_app", edit({ p_status: "applied" })));
    await must(creator.db.rpc("update_app", edit({ p_status: null })));
    expect((await must(anon().from("apps").select("status").eq("id", appId).single())).status).toBe("applied");
  });

  it("admin can edit any app", async () => {
    await must(admin.db.rpc("update_app", edit()));
  });

  it("member and tester cannot edit; visitor is unauthenticated", async () => {
    await expectCode(other.db.rpc("update_app", edit()), "permission-denied");
    await expectCode(tester.db.rpc("update_app", edit()), "permission-denied");
    await expectCode(anon().rpc("update_app", edit()), "unauthenticated");
  });

  it("validates fields like create_app", async () => {
    for (const bad of [
      { p_name: "x".repeat(51) },
      { p_name: "   " },
      { p_description: "x".repeat(281) },
      { p_feedback_guide: "x".repeat(501) },
      { p_opt_in_url: "https://example.com/apps/testing/id.a.b" },
      { p_store_url: "https://apkpure.com/kasrt" },
      { p_package_name: "bukan paket" },
      { p_status: "approved" },
      { p_test_start_date: "01-10-2026" },
    ]) {
      await expectCode(creator.db.rpc("update_app", edit(bad)), "invalid-argument");
    }
    await must(creator.db.rpc("update_app", edit({ p_name: "x".repeat(50), p_package_name: null })));
  });

  it("checks package uniqueness on update too", async () => {
    const pkg = `id.lain.paket${uniq()}`;
    await createApp(other, { p_package_name: pkg });
    await expectCode(creator.db.rpc("update_app", edit({ p_package_name: pkg })), "already-exists");
    // keeping its own package is fine
    const own = `id.punya.sendiri${uniq()}`;
    await must(creator.db.rpc("update_app", edit({ p_package_name: own })));
    await must(creator.db.rpc("update_app", edit({ p_package_name: own })));
  });

  it("creator can soft delete; the app disappears", async () => {
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    expect(await must(anon().from("apps").select("id").eq("id", appId))).toHaveLength(0);
    const row = await must(service.from("apps").select("deleted, deleted_at").eq("id", appId).single());
    expect(row.deleted).toBe(true);
    expect(row.deleted_at).not.toBeNull();
    await expectCode(creator.db.rpc("update_app", edit()), "not-found");
    await expectCode(creator.db.rpc("delete_app", { p_app_id: appId }), "not-found");
  });

  it("creator can undo a delete within 10 minutes (ADR-009 §7)", async () => {
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    await expectCode(other.db.rpc("restore_app", { p_app_id: appId }), "permission-denied");
    await must(creator.db.rpc("restore_app", { p_app_id: appId }));
    expect(await must(anon().from("apps").select("id").eq("id", appId))).toHaveLength(1);
    const row = await must(service.from("apps").select("deleted_at").eq("id", appId).single());
    expect(row.deleted_at).toBeNull();
  });

  it("after the undo window only an admin restores", async () => {
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    const past = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await must(service.from("apps").update({ deleted_at: past }).eq("id", appId).select("id"));
    await expectCode(creator.db.rpc("restore_app", { p_app_id: appId }), "permission-denied");
    await must(admin.db.rpc("restore_app", { p_app_id: appId }));
  });

  it("others cannot delete", async () => {
    await expectCode(other.db.rpc("delete_app", { p_app_id: appId }), "permission-denied");
    await expectCode(anon().rpc("delete_app", { p_app_id: appId }), "unauthenticated");
  });

  it("admin can soft delete and restore", async () => {
    await must(admin.db.rpc("delete_app", { p_app_id: appId }));
    await must(admin.db.rpc("restore_app", { p_app_id: appId }));
    expect(await must(anon().from("apps").select("id").eq("id", appId))).toHaveLength(1);
  });

  it("restore refuses when the package name was taken meanwhile", async () => {
    const pkg = `id.rebut.paket${uniq()}`;
    const first = await createApp(creator, { p_package_name: pkg });
    await must(creator.db.rpc("delete_app", { p_app_id: first }));
    await createApp(other, { p_package_name: pkg });
    await expectCode(admin.db.rpc("restore_app", { p_app_id: first }), "already-exists");
  });

  it("restore of an unknown app is not-found", async () => {
    await expectCode(admin.db.rpc("restore_app", { p_app_id: randomUUID() }), "not-found");
  });
});

describe("join_as_tester", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
  });

  it("happy path: masked entry, stats and reciprocity follow", async () => {
    const before = (await profileStats(tester.id)).testing_count;
    await must(join(tester, appId));
    const entry = await entryOf(appId, tester.id);
    expect(entry).toMatchObject({
      app_id: appId,
      user_id: tester.id,
      status: "active",
      added_by: "self",
      display_name: "Ayu Lestari",
      masked_email: "ay*****@gmail.com",
      feedback_sent: false,
      feedback_verified: false,
      replied: false,
      left_at: null,
    });
    expect(JSON.stringify(entry)).not.toContain(tester.email);
    expect((await stats(appId)).active_tester_count).toBe(1);
    expect((await profileStats(tester.id)).testing_count).toBe(before + 1);
  });

  it("creator cannot join own app", async () => {
    await expectCode(join(creator, appId), "permission-denied");
  });

  it("double join is rejected", async () => {
    await must(join(tester, appId));
    await expectCode(join(tester, appId), "already-exists");
  });

  it.each(["joinedGroup", "optedIn", "installed"])("requires checklist item %s", async (key) => {
    await expectCode(join(tester, appId, { ...checklist, [key]: false }), "invalid-argument", /checklist/);
  });

  it("requires a checklist at all, with real booleans", async () => {
    await expectCode(tester.db.rpc("join_as_tester", { p_app_id: appId, p_checklist: null }), "invalid-argument");
    await expectCode(join(tester, appId, { joinedGroup: "true", optedIn: true, installed: true }), "invalid-argument");
  });

  it("left re-activates with a new opt-in date; removed is refused", async () => {
    await must(join(tester, appId));
    await must(service.from("testers").update({ opted_in_at: new Date(Date.now() - 5 * DAY_MS).toISOString() }).eq("app_id", appId).eq("user_id", tester.id));
    await must(tester.db.rpc("leave_testing", { p_app_id: appId }));
    let entry = await entryOf(appId, tester.id);
    expect(entry.status).toBe("left");
    expect(entry.left_at).not.toBeNull();

    await must(join(tester, appId));
    entry = await entryOf(appId, tester.id);
    expect(entry.status).toBe("active");
    expect(entry.left_at).toBeNull();
    expect(Date.now() - new Date(entry.opted_in_at as string).getTime()).toBeLessThan(60_000);
    expect(await must(service.from("testers").select("id").eq("app_id", appId))).toHaveLength(1);

    await must(creator.db.rpc("update_tester", { p_tester_id: entry.id, p_patch: { status: "removed" } }));
    await expectCode(join(tester, appId), "permission-denied", /mengeluarkan/);
  });

  it("unknown or soft-deleted app is not-found; a malformed id is rejected", async () => {
    await expectCode(join(tester, randomUUID()), "not-found");
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    await expectCode(join(tester, appId), "not-found");
    await expectCode(join(tester, "tidak-ada"), "22P02");
  });

  it("requires auth", async () => {
    await expectCode(anon().rpc("join_as_tester", { p_app_id: appId, p_checklist: checklist }), "unauthenticated");
  });
});

describe("leave_testing", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
  });

  it("own active entry becomes left; leaving twice is failed-precondition", async () => {
    await must(join(tester, appId));
    await must(tester.db.rpc("leave_testing", { p_app_id: appId }));
    expect((await stats(appId)).active_tester_count).toBe(0);
    await expectCode(tester.db.rpc("leave_testing", { p_app_id: appId }), "failed-precondition");
  });

  it("no entry is not-found", async () => {
    await expectCode(other.db.rpc("leave_testing", { p_app_id: appId }), "not-found", /belum terdaftar/);
  });
});

describe("mark_feedback_sent", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
    await must(join(tester, appId));
  });
  const mark = (m: Member, sent: unknown, summary?: string) =>
    m.db.rpc("mark_feedback_sent", { p_app_id: appId, p_sent: sent, ...(summary === undefined ? {} : { p_summary: summary }) });

  it("sets and clears feedback; app stats follow", async () => {
    await must(mark(tester, true, "  Widget tidak update setelah restart.  "));
    let entry = await entryOf(appId, tester.id);
    expect(entry.feedback_sent).toBe(true);
    expect(entry.feedback_summary).toBe("Widget tidak update setelah restart.");
    expect(entry.feedback_sent_at).not.toBeNull();
    expect((await stats(appId)).feedback_sent_count).toBe(1);

    await must(mark(tester, false, "diabaikan"));
    entry = await entryOf(appId, tester.id);
    expect(entry).toMatchObject({ feedback_sent: false, feedback_sent_at: null, feedback_summary: null });
    expect((await stats(appId)).feedback_sent_count).toBe(0);
  });

  it("empty summary is stored as null", async () => {
    await must(mark(tester, true, "   "));
    expect((await entryOf(appId, tester.id)).feedback_summary).toBeNull();
  });

  it("summary is capped at 500", async () => {
    await must(mark(tester, true, "x".repeat(500)));
    await expectCode(mark(tester, true, "x".repeat(501)), "invalid-argument", /500/);
  });

  it("requires a boolean sent", async () => {
    await expectCode(mark(tester, null), "invalid-argument");
  });

  it("only an active entry; no entry is not-found", async () => {
    await must(tester.db.rpc("leave_testing", { p_app_id: appId }));
    await expectCode(mark(tester, true), "failed-precondition");
    await expectCode(mark(other, true), "not-found");
  });

  it("creator cannot tick feedback for a tester (matrix: Creator ❌)", async () => {
    await expectCode(mark(creator, true), "not-found");
  });
});

describe("add_manual_tester", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
  });
  const add = (m: Member, over: Record<string, unknown> = {}) =>
    m.db.rpc("add_manual_tester", { p_app_id: appId, p_display_name: "Wulan Sari", p_email: "Wulan.Sari@gmail.com", ...over });

  it("creator only; email masked and never stored", async () => {
    await expectCode(add(other), "permission-denied");
    await expectCode(add(tester), "permission-denied");
    await expectCode(anon().rpc("add_manual_tester", { p_app_id: appId, p_display_name: "W", p_email: "w@gmail.com" }), "unauthenticated");

    const id = await must(add(creator, { p_opted_in_at: "2026-10-01" }));
    const entry = await must(service.from("testers").select("*").eq("id", id).single());
    expect(entry).toMatchObject({ added_by: "creator", masked_email: "wu*****@gmail.com", status: "active", user_id: null });
    expect(new Date(entry.opted_in_at).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(JSON.stringify(entry).toLowerCase()).not.toContain("wulan.sari@gmail.com");
    expect((await stats(appId)).active_tester_count).toBe(1);
  });

  it("defaults opt-in to now", async () => {
    const id = await must(add(creator));
    const entry = await must(service.from("testers").select("opted_in_at").eq("id", id).single());
    expect(Date.now() - new Date(entry.opted_in_at).getTime()).toBeLessThan(60_000);
  });

  it("admin can add manual testers on any app", async () => {
    await must(add(admin, { p_display_name: "Hendra", p_email: "hendra@gmail.com" }));
  });

  it("rejects invalid email, future opt-in, missing name", async () => {
    await expectCode(add(creator, { p_email: "wulan" }), "invalid-argument", /email/);
    const future = new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10);
    await expectCode(add(creator, { p_opted_in_at: future }), "invalid-argument", /masa depan/);
    await expectCode(add(creator, { p_display_name: " " }), "invalid-argument", /wajib/);
    await expectCode(add(creator, { p_display_name: "x".repeat(51) }), "invalid-argument", /50/);
  });

  it("unknown app is not-found", async () => {
    await expectCode(creator.db.rpc("add_manual_tester", { p_app_id: randomUUID(), p_display_name: "W", p_email: "w@gmail.com" }), "not-found");
  });
});

describe("update_tester", () => {
  let appId: string;
  let entryId: string;
  let manualId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
    await must(join(tester, appId));
    entryId = (await entryOf(appId, tester.id)).id as string;
    manualId = (await must(
      creator.db.rpc("add_manual_tester", { p_app_id: appId, p_display_name: "Wulan Sari", p_email: "wulan@gmail.com" }),
    )) as string;
  });
  const patch = (m: Member, p: Record<string, unknown>, id = entryId) => m.db.rpc("update_tester", { p_tester_id: id, p_patch: p });
  const row = async (id = entryId) => must(service.from("testers").select("*").eq("id", id).single());

  it("creator can change status, opt-in date, note, verified, replied", async () => {
    await must(patch(creator, { feedback_verified: true, replied: true }));
    await must(patch(creator, { note: "  Sudah dicek di Play Console  " }));
    const tenDaysAgo = new Date(Date.now() - 10 * DAY_MS).toISOString();
    await must(patch(creator, { opted_in_at: tenDaysAgo }));
    let r = await row();
    expect(r).toMatchObject({ feedback_verified: true, replied: true, note: "Sudah dicek di Play Console" });
    expect(new Date(r.opted_in_at).toISOString()).toBe(tenDaysAgo);
    expect((await stats(appId)).feedback_verified_count).toBe(1);

    await must(patch(creator, { status: "removed" }));
    r = await row();
    expect(r.status).toBe("removed");
    expect(r.left_at).not.toBeNull();

    await must(patch(creator, { status: "left", left_at: new Date().toISOString() }, manualId));
    expect((await row(manualId)).status).toBe("left");
    expect((await stats(appId)).active_tester_count).toBe(0);
  });

  it("re-activating clears left_at; empty note becomes null", async () => {
    await must(patch(creator, { status: "left", note: "x" }));
    await must(patch(creator, { status: "active", note: "  " }));
    expect(await row()).toMatchObject({ status: "active", left_at: null, note: null });
  });

  it("can un-verify (FR-24)", async () => {
    await must(patch(creator, { feedback_verified: true }));
    await must(patch(creator, { feedback_verified: false }));
    expect((await row()).feedback_verified).toBe(false);
  });

  it("rejects bad values", async () => {
    await expectCode(patch(creator, { note: "x".repeat(141) }), "invalid-argument", /140/);
    await expectCode(patch(creator, { status: "banned" }), "invalid-argument");
    await expectCode(patch(creator, { feedback_verified: "ya" }), "invalid-argument");
    await expectCode(patch(creator, { opted_in_at: new Date(Date.now() + 10 * DAY_MS).toISOString() }), "invalid-argument", /masa depan/);
    await expectCode(patch(creator, { opted_in_at: null }), "invalid-argument");
    await expectCode(creator.db.rpc("update_tester", { p_tester_id: entryId, p_patch: [] }), "invalid-argument");
  });

  it.each([
    { feedback_sent: true },
    { feedback_sent_at: new Date().toISOString() },
    { feedback_summary: "Bagus" },
    { masked_email: "full@gmail.com" },
    { user_id: randomUUID() },
    { display_name: "Ganti" },
    { added_by: "creator" },
    { app_id: randomUUID() },
  ])("creator cannot touch %o", async (p) => {
    await expectCode(patch(creator, p), "permission-denied");
  });

  it("non-creators cannot manage testers; the tester cannot edit their own entry", async () => {
    await expectCode(patch(other, { status: "removed" }), "permission-denied");
    await expectCode(patch(other, { feedback_verified: true }), "permission-denied");
    await expectCode(patch(tester, { feedback_verified: true }), "permission-denied");
    await expectCode(patch(tester, { replied: true }), "permission-denied");
    await expectCode(patch(tester, { status: "left" }), "permission-denied");
    await expectCode(patch(tester, { feedback_sent: true }), "permission-denied");
    await expectCode(anon().rpc("update_tester", { p_tester_id: entryId, p_patch: { status: "removed" } }), "unauthenticated");
  });

  it("admin can manage testers and moderate feedback summaries", async () => {
    await must(patch(admin, { status: "removed", note: "Akun spam" }));
    await must(patch(admin, { feedback_verified: true, replied: true }));
    await must(patch(admin, { feedback_sent: true, feedback_sent_at: new Date().toISOString(), feedback_summary: "Ringkasan disembunyikan admin." }));
    await must(patch(admin, { feedback_summary: null }));
    expect(await row()).toMatchObject({ status: "removed", note: "Akun spam", feedback_sent: true, feedback_summary: null });
  });

  it("admin cannot change identity fields", async () => {
    await expectCode(patch(admin, { masked_email: "ay*****@gmail.com" }), "permission-denied");
    await expectCode(patch(admin, { display_name: "Ganti" }), "permission-denied");
  });

  it("unknown entry is not-found", async () => {
    await expectCode(patch(creator, { replied: true }, randomUUID()), "not-found");
  });
});

describe("add_build", () => {
  let appId: string;
  beforeEach(async () => {
    appId = await createApp(creator);
  });
  const build = (m: Member, over: Record<string, unknown> = {}) =>
    m.db.rpc("add_build", { p_app_id: appId, p_version_name: "1.0.3 (13)", p_uploaded_at: "2026-10-30", p_changelog: "Perbaiki crash saat buka laporan", ...over });

  it("creator or admin only; stats follow", async () => {
    await expectCode(build(tester), "permission-denied");
    await expectCode(build(other), "permission-denied");
    await expectCode(anon().rpc("add_build", { p_app_id: appId, p_version_name: "1", p_uploaded_at: "2026-10-30", p_changelog: "x" }), "unauthenticated");
    await must(build(creator, { p_version_name: "1.0.1", p_uploaded_at: "2026-10-20", p_changelog: "Perbaiki crash widget" }));
    await must(build(admin, { p_version_name: "1.1.0", p_uploaded_at: "2026-10-30", p_changelog: "Tambah kota Ambon" }));
    const s = await stats(appId);
    expect(s.build_count).toBe(2);
    expect(new Date(s.last_build_at as string).toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });

  it("enforces versionName 40 and changelog 140", async () => {
    await must(build(creator, { p_version_name: "v".repeat(40) }));
    await expectCode(build(creator, { p_version_name: "v".repeat(41) }), "invalid-argument", /40/);
    await must(build(creator, { p_changelog: "c".repeat(140) }));
    await expectCode(build(creator, { p_changelog: "c".repeat(141) }), "invalid-argument", /140/);
  });

  it("requires a valid, non-future upload date", async () => {
    await expectCode(build(creator, { p_uploaded_at: null }), "invalid-argument");
    await expectCode(build(creator, { p_uploaded_at: "kemarin" }), "invalid-argument");
    const future = new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10);
    await expectCode(build(creator, { p_uploaded_at: future }), "invalid-argument", /masa depan/);
  });

  it("limits to 10 builds per app per rolling 24 h", async () => {
    for (let i = 0; i < 10; i++) await must(build(creator, { p_version_name: `1.0.${i}` }));
    await expectCode(build(creator), "resource-exhausted", /10/);
    await must(service.from("builds").update({ created_at: new Date(Date.now() - DAY_MS - 60_000).toISOString() }).eq("app_id", appId));
    await must(build(creator));
  });

  it("soft-deleted app is not-found for its creator", async () => {
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    await expectCode(build(creator), "not-found");
  });
});

describe("soft delete and reciprocity", () => {
  it("deleting an app drops it from apps_created_count and from its testers' reciprocity", async () => {
    const appId = await createApp(creator);
    await must(join(tester, appId));
    const t0 = await profileStats(tester.id);
    const c0 = await profileStats(creator.id);
    await must(creator.db.rpc("delete_app", { p_app_id: appId }));
    expect((await profileStats(tester.id)).testing_count).toBe(t0.testing_count - 1);
    expect((await profileStats(creator.id)).apps_created_count).toBe(c0.apps_created_count - 1);
  });

  it("the creator's reciprocity shows on their apps", async () => {
    const appId = await createApp(creator);
    const before = (await stats(appId)).creator_testing_count as number;
    const otherApp = await createApp(other);
    await must(join(creator, otherApp));
    expect((await stats(appId)).creator_testing_count).toBe(before + 1);
  });
});

describe("set_email_reminders (PRD FR-46)", () => {
  const flag = async (id: string) =>
    (await must(anon().from("profiles").select("email_reminders").eq("id", id).single())).email_reminders as boolean;

  it("is on by default", async () => {
    expect(await flag(other.id)).toBe(true);
  });

  it("changes only the caller's own flag", async () => {
    await must(other.db.rpc("set_email_reminders", { p_enabled: false }));
    expect(await flag(other.id)).toBe(false);
    expect(await flag(tester.id)).toBe(true);
    await must(other.db.rpc("set_email_reminders", { p_enabled: true }));
    expect(await flag(other.id)).toBe(true);
  });

  it("rejects null", async () => {
    await expectCode(other.db.rpc("set_email_reminders", { p_enabled: null }), "invalid-argument");
  });

  it("requires auth", async () => {
    await expectCode(anon().rpc("set_email_reminders", { p_enabled: false }), "unauthenticated");
  });
});
