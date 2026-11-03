// Cohort RPCs, part 1 (plan task A2): create, members, leave, WhatsApp link, settle.
// Contract: docs/contract.md. Start, join, reassign and close are tested with their migrations.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  createApp,
  createCohort,
  expectCode,
  forceActive,
  forceClosed,
  member,
  must,
  service,
  type Member,
} from "./helpers";

let admin: Member;
let creator: Member;
let creator2: Member;
let pure: Member;
let other: Member;
let app2Id: string;

beforeAll(async () => {
  [admin, creator, creator2, pure, other] = await Promise.all([
    member("yusuf", "Yusuf Hidayat", "admin"),
    member("galih", "Galih Prasetyo"),
    member("wulan", "Wulan Sari"),
    member("hana", "Hana Safitri"),
    member("dimas", "Dimas Aditya"),
  ]);
  app2Id = await createApp(creator2);
});

const add = (db: Member["db"], cohortId: string, userId: string, appIdArg: string | null = null) =>
  db.rpc("add_cohort_member", { p_cohort_id: cohortId, p_user_id: userId, p_app_id: appIdArg });

const membersOf = async (cohortId: string) =>
  (await must(anon().from("cohort_members").select("user_id, app_id, standing").eq("cohort_id", cohortId))) as {
    user_id: string;
    app_id: string | null;
    standing: string | null;
  }[];

describe("create_cohort", () => {
  it("creates a Forming cohort with a trimmed name and no Day 0", async () => {
    const id = await createCohort(admin, "  Cohort #3  ");
    const c = await must(anon().from("cohorts").select("*").eq("id", id).single());
    expect(c).toMatchObject({ name: "Cohort #3", status: "forming", day0_at: null, closed_at: null });
  });

  it.each([
    ["empty", "   "],
    ["over 50 characters", "x".repeat(51)],
  ])("rejects a name that is %s", async (_label, name) => {
    await expectCode(admin.db.rpc("create_cohort", { p_name: name }), "invalid-argument");
  });

  it("is admin only", async () => {
    await expectCode(creator.db.rpc("create_cohort", { p_name: "Cohort liar" }), "permission-denied");
    await expectCode(anon().rpc("create_cohort", { p_name: "Cohort liar" }), "unauthenticated");
  });
});

describe("add_cohort_member", () => {
  it("adds a creator with their own app and a pure tester without one", async () => {
    const id = await createCohort(admin);
    const app = await createApp(creator);
    await must(add(admin.db, id, creator.id, app));
    await must(add(admin.db, id, pure.id));
    const rows = await membersOf(id);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ user_id: creator.id, app_id: app, standing: null });
    expect(rows).toContainEqual({ user_id: pure.id, app_id: null, standing: null });
  });

  it("is admin only", async () => {
    const id = await createCohort(admin);
    const app = await createApp(creator);
    await expectCode(add(creator.db, id, creator.id, app), "permission-denied");
    await expectCode(add(anon(), id, creator.id, app), "unauthenticated");
  });

  it("refuses a missing cohort, a missing member, a missing or deleted app", async () => {
    const id = await createCohort(admin);
    await expectCode(add(admin.db, randomUUID(), creator.id, await createApp(creator)), "not-found");
    await expectCode(add(admin.db, id, randomUUID()), "not-found");
    await expectCode(add(admin.db, id, creator.id, randomUUID()), "not-found");
    const gone = await createApp(creator);
    await must(creator.db.rpc("delete_app", { p_app_id: gone }));
    await expectCode(add(admin.db, id, creator.id, gone), "not-found");
  });

  it("refuses an app that belongs to someone else", async () => {
    const id = await createCohort(admin);
    await expectCode(add(admin.db, id, creator.id, app2Id), "invalid-argument");
  });

  it("allows one membership, so one app, per member per cohort (PRD §17 Q7)", async () => {
    const id = await createCohort(admin);
    const second = await createApp(creator);
    await must(add(admin.db, id, creator.id, await createApp(creator)));
    await expectCode(add(admin.db, id, creator.id, second), "already-exists", /sudah ada di cohort/);
    await expectCode(add(admin.db, id, creator.id), "already-exists");
  });

  it("refuses an app already in another non-closed cohort, but not one in a closed cohort", async () => {
    const first = await createCohort(admin);
    const second = await createCohort(admin);
    const app = await createApp(creator2);
    await must(add(admin.db, first, creator2.id, app));
    await expectCode(add(admin.db, second, creator2.id, app), "already-exists");
    await forceActive(first);
    await expectCode(add(admin.db, second, creator2.id, app), "already-exists");
    await forceClosed(first);
    await must(add(admin.db, second, creator2.id, app));
  });

  it("lets a member with two apps bring the second one to a different cohort", async () => {
    const first = await createCohort(admin);
    const second = await createCohort(admin);
    const extra = await createApp(creator);
    await must(add(admin.db, first, creator.id, await createApp(creator)));
    await must(add(admin.db, second, creator.id, extra));
  });

  it("only while the cohort is Forming", async () => {
    const id = await createCohort(admin);
    await forceActive(id);
    await expectCode(add(admin.db, id, pure.id), "failed-precondition");
    await forceClosed(id);
    await expectCode(add(admin.db, id, pure.id), "failed-precondition");
  });

  it("refuses a member who is Owing in any cohort, until settled", async () => {
    const old = await createCohort(admin);
    await must(add(admin.db, old, other.id));
    await forceClosed(old);
    await must(service.from("cohort_members").update({ standing: "owing" }).eq("cohort_id", old).eq("user_id", other.id));
    const next = await createCohort(admin);
    await expectCode(add(admin.db, next, other.id), "failed-precondition", /Owing/);
    await must(admin.db.rpc("settle_member", { p_cohort_id: old, p_user_id: other.id }));
    await must(add(admin.db, next, other.id));
  });
});

describe("remove_cohort_member", () => {
  it("removes a member while Forming", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, creator.id, await createApp(creator)));
    await must(admin.db.rpc("remove_cohort_member", { p_cohort_id: id, p_user_id: creator.id }));
    expect(await membersOf(id)).toHaveLength(0);
  });

  it("refuses a non-member, a started cohort and non-admins", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, pure.id));
    await expectCode(admin.db.rpc("remove_cohort_member", { p_cohort_id: id, p_user_id: other.id }), "not-found");
    await expectCode(creator.db.rpc("remove_cohort_member", { p_cohort_id: id, p_user_id: pure.id }), "permission-denied");
    await expectCode(admin.db.rpc("remove_cohort_member", { p_cohort_id: randomUUID(), p_user_id: pure.id }), "not-found");
    await forceActive(id);
    await expectCode(admin.db.rpc("remove_cohort_member", { p_cohort_id: id, p_user_id: pure.id }), "failed-precondition");
    expect(await membersOf(id)).toHaveLength(1);
  });
});

describe("leave_cohort", () => {
  it("lets a pure tester leave while Forming", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, pure.id));
    await must(pure.db.rpc("leave_cohort", { p_cohort_id: id }));
    expect(await membersOf(id)).toHaveLength(0);
  });

  it("refuses creators, non-members, started cohorts and visitors", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, creator.id, await createApp(creator)));
    await must(add(admin.db, id, pure.id));
    await expectCode(creator.db.rpc("leave_cohort", { p_cohort_id: id }), "permission-denied");
    await expectCode(other.db.rpc("leave_cohort", { p_cohort_id: id }), "not-found");
    await expectCode(pure.db.rpc("leave_cohort", { p_cohort_id: randomUUID() }), "not-found");
    await expectCode(anon().rpc("leave_cohort", { p_cohort_id: id }), "unauthenticated");
    await forceActive(id);
    await expectCode(pure.db.rpc("leave_cohort", { p_cohort_id: id }), "failed-precondition");
    expect(await membersOf(id)).toHaveLength(2);
  });
});

describe("set_cohort_link / get_cohort_link (FR-49, FR-50)", () => {
  const url = "https://chat.whatsapp.com/LqJ8x2Tesbareng";
  const get = (db: Member["db"], id: string) => db.rpc("get_cohort_link", { p_cohort_id: id });

  it("members of the cohort and the admin get the link; nobody else does", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, creator.id, await createApp(creator)));
    await must(add(admin.db, id, pure.id));
    await must(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: `  ${url}  ` }));
    for (const m of [creator, pure, admin]) expect(await must(get(m.db, id))).toBe(url);
    await expectCode(get(other.db, id), "permission-denied");
    await expectCode(get(anon(), id), "unauthenticated");
    await expectCode(get(admin.db, randomUUID()), "not-found");
  });

  it("the link table follows the same rule for direct reads", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, pure.id));
    await must(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: url }));
    expect(await must(pure.db.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", id))).toHaveLength(1);
    expect(await must(admin.db.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", id))).toHaveLength(1);
    expect(await must(other.db.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", id))).toHaveLength(0);
    expect(await must(anon().from("cohort_links").select("whatsapp_group_url").eq("cohort_id", id))).toHaveLength(0);
  });

  it("replaces the link, removes it on empty, returns null when unset", async () => {
    const id = await createCohort(admin);
    expect(await must(get(admin.db, id))).toBeNull();
    await must(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: url }));
    await must(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: `${url}Baru` }));
    expect(await must(get(admin.db, id))).toBe(`${url}Baru`);
    await must(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: "" }));
    expect(await must(get(admin.db, id))).toBeNull();
  });

  it.each(["https://wa.me/628123456789", "http://chat.whatsapp.com/abc", "https://chat.whatsapp.com/", "chat.whatsapp.com/abc"])(
    "rejects %s",
    async (bad) => {
      const id = await createCohort(admin);
      await expectCode(admin.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: bad }), "invalid-argument");
    },
  );

  it("is admin only to set", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, creator.id, await createApp(creator)));
    await expectCode(creator.db.rpc("set_cohort_link", { p_cohort_id: id, p_url: url }), "permission-denied");
    await expectCode(admin.db.rpc("set_cohort_link", { p_cohort_id: randomUUID(), p_url: url }), "not-found");
  });
});

describe("settle_member (FR-37)", () => {
  it("turns Owing into Settled with a timestamp", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, pure.id));
    await forceClosed(id);
    await must(service.from("cohort_members").update({ standing: "owing" }).eq("cohort_id", id).eq("user_id", pure.id));
    await must(admin.db.rpc("settle_member", { p_cohort_id: id, p_user_id: pure.id }));
    const row = await must(anon().from("cohort_members").select("standing, settled_at").eq("cohort_id", id).eq("user_id", pure.id).single());
    expect(row.standing).toBe("settled");
    expect(row.settled_at).not.toBeNull();
  });

  it("refuses members who are not Owing, non-members and non-admins", async () => {
    const id = await createCohort(admin);
    await must(add(admin.db, id, pure.id));
    await expectCode(admin.db.rpc("settle_member", { p_cohort_id: id, p_user_id: pure.id }), "failed-precondition");
    await forceClosed(id);
    await must(service.from("cohort_members").update({ standing: "good" }).eq("cohort_id", id).eq("user_id", pure.id));
    await expectCode(admin.db.rpc("settle_member", { p_cohort_id: id, p_user_id: pure.id }), "failed-precondition");
    await expectCode(admin.db.rpc("settle_member", { p_cohort_id: id, p_user_id: other.id }), "not-found");
    await expectCode(pure.db.rpc("settle_member", { p_cohort_id: id, p_user_id: pure.id }), "permission-denied");
  });
});
