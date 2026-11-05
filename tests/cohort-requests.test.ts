// Cohort app requests (ADR-013, PRD FR-30a/FR-30b): a creator asks to bring an app
// into a Forming cohort, an admin approves or rejects. Contract: docs/contract.md.
import { beforeAll, describe, expect, it } from "vitest";
import { anon, createApp, createCohort, expectCode, forceActive, member, must, service, type Member } from "./helpers";

let admin: Member;
let a: Member;
let b: Member;

beforeAll(async () => {
  [admin, a, b] = await Promise.all([
    member("yusuf", "Yusuf Hidayat", "admin"),
    member("galih", "Galih Prasetyo"),
    member("wulan", "Wulan Sari"),
  ]);
});

type Req = { id: string; status: string; reason: string | null; decided_by: string | null };
const request = (m: Member, cohortId: string, appId: string) =>
  m.db.rpc("request_cohort_slot", { p_cohort_id: cohortId, p_app_id: appId });
const req = async (id: string) =>
  (await must(service.from("cohort_requests").select("id, status, reason, decided_by").eq("id", id).single())) as Req;
const isMember = async (cohortId: string, userId: string) =>
  ((await must(service.from("cohort_members").select("app_id").eq("cohort_id", cohortId).eq("user_id", userId))) as { app_id: string | null }[])[0] ?? null;

/** Fresh member with one app, so the one-pending rule does not leak across tests. */
const creator = async () => {
  const m = await member("dimas", "Dimas Aditya");
  return { m, appId: await createApp(m) };
};

describe("request_cohort_slot", () => {
  it("creates a pending request for the caller's own app", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    const id = (await must(request(m, cohort, appId))) as string;
    expect(await req(id)).toMatchObject({ status: "pending", reason: null });
  });

  it("allows only one pending request at a time", async () => {
    const { m, appId } = await creator();
    const app2 = await createApp(m);
    const [c1, c2] = await Promise.all([createCohort(admin), createCohort(admin)]);
    await must(request(m, c1, appId));
    await expectCode(request(m, c2, app2), "already-exists");
  });

  it("rejects someone else's app, a non-Forming cohort, and an app already in an open cohort", async () => {
    const { m, appId } = await creator();
    const bApp = await createApp(b);
    const forming = await createCohort(admin);
    await expectCode(request(m, forming, bApp), "permission-denied");

    const active = await createCohort(admin);
    await forceActive(active);
    await expectCode(request(m, active, appId), "failed-precondition");

    const other = await createCohort(admin);
    await must(admin.db.rpc("add_cohort_member", { p_cohort_id: other, p_user_id: m.id, p_app_id: appId }));
    await expectCode(request(m, forming, appId), "already-exists");
  });

  it("rejects an existing member and an Owing member", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    await must(m.db.rpc("join_cohort_as_tester", { p_cohort_id: cohort }));
    await expectCode(request(m, cohort, appId), "already-exists");

    const owing = await creator();
    const old = await createCohort(admin);
    await must(owing.m.db.rpc("join_cohort_as_tester", { p_cohort_id: old }));
    await must(service.from("cohort_members").update({ standing: "owing" }).eq("cohort_id", old).eq("user_id", owing.m.id));
    await expectCode(request(owing.m, await createCohort(admin), owing.appId), "failed-precondition");
  });

  it("needs a signed-in member", async () => {
    await expectCode(anon().rpc("request_cohort_slot", { p_cohort_id: crypto.randomUUID(), p_app_id: crypto.randomUUID() }), "unauthenticated");
  });
});

describe("withdraw_cohort_request", () => {
  it("withdraws the caller's own pending request, then allows a new one", async () => {
    const { m, appId } = await creator();
    const [c1, c2] = await Promise.all([createCohort(admin), createCohort(admin)]);
    const id = (await must(request(m, c1, appId))) as string;
    await expectCode(a.db.rpc("withdraw_cohort_request", { p_request_id: id }), "not-found");
    await must(m.db.rpc("withdraw_cohort_request", { p_request_id: id }));
    expect((await req(id)).status).toBe("withdrawn");
    await expectCode(m.db.rpc("withdraw_cohort_request", { p_request_id: id }), "failed-precondition");
    await must(request(m, c2, appId));
  });
});

describe("approve_cohort_request / reject_cohort_request", () => {
  it("approve adds the creator with the requested app", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    const id = (await must(request(m, cohort, appId))) as string;
    await expectCode(m.db.rpc("approve_cohort_request", { p_request_id: id }), "permission-denied");
    await must(admin.db.rpc("approve_cohort_request", { p_request_id: id }));
    expect(await isMember(cohort, m.id)).toEqual({ app_id: appId });
    expect(await req(id)).toMatchObject({ status: "approved", decided_by: admin.id });
    await expectCode(admin.db.rpc("approve_cohort_request", { p_request_id: id }), "failed-precondition");
  });

  it("reject stores an optional trimmed reason, admin only", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    const id = (await must(request(m, cohort, appId))) as string;
    await expectCode(m.db.rpc("reject_cohort_request", { p_request_id: id }), "permission-denied");
    await expectCode(admin.db.rpc("reject_cohort_request", { p_request_id: id, p_reason: "x".repeat(281) }), "invalid-argument");
    await must(admin.db.rpc("reject_cohort_request", { p_request_id: id, p_reason: "  Cohort sudah penuh.  " }));
    expect(await req(id)).toMatchObject({ status: "rejected", reason: "Cohort sudah penuh.", decided_by: admin.id });
    expect(await isMember(cohort, m.id)).toBeNull();

    const id2 = (await must(request(m, await createCohort(admin), appId))) as string;
    await must(admin.db.rpc("reject_cohort_request", { p_request_id: id2, p_reason: "   " }));
    expect(await req(id2)).toMatchObject({ status: "rejected", reason: null });
  });
});

describe("auto-closing pending requests", () => {
  it("approves when the admin adds the member directly, withdraws when they join as pure tester", async () => {
    const one = await creator();
    const c1 = await createCohort(admin);
    const id1 = (await must(request(one.m, c1, one.appId))) as string;
    await must(admin.db.rpc("add_cohort_member", { p_cohort_id: c1, p_user_id: one.m.id, p_app_id: one.appId }));
    expect((await req(id1)).status).toBe("approved");

    const two = await creator();
    const c2 = await createCohort(admin);
    const id2 = (await must(request(two.m, c2, two.appId))) as string;
    await must(two.m.db.rpc("join_cohort_as_tester", { p_cohort_id: c2 }));
    expect((await req(id2)).status).toBe("withdrawn");
  });

  it("expires when the cohort leaves Forming, withdraws when the app is deleted", async () => {
    const one = await creator();
    const c1 = await createCohort(admin);
    const id1 = (await must(request(one.m, c1, one.appId))) as string;
    await forceActive(c1);
    expect((await req(id1)).status).toBe("expired");

    const two = await creator();
    const id2 = (await must(request(two.m, await createCohort(admin), two.appId))) as string;
    await must(two.m.db.rpc("delete_app", { p_app_id: two.appId }));
    expect((await req(id2)).status).toBe("withdrawn");
  });
});

describe("reads (RLS)", () => {
  it("a member sees only their own requests, the admin sees all, anon none", async () => {
    const { m, appId } = await creator();
    const id = (await must(request(m, await createCohort(admin), appId))) as string;
    const mine = (await must(m.db.from("cohort_requests").select("id").eq("id", id))) as unknown[];
    const others = (await must(a.db.from("cohort_requests").select("id").eq("id", id))) as unknown[];
    const admins = (await must(admin.db.from("cohort_requests").select("id").eq("id", id))) as unknown[];
    expect([mine.length, others.length, admins.length]).toEqual([1, 0, 1]);
    expect((await anon().from("cohort_requests").select("id").eq("id", id)).error).not.toBeNull();
  });

  it("nobody writes the table directly", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    for (const db of [m.db, admin.db]) {
      const { error } = await db.from("cohort_requests").insert({ cohort_id: cohort, user_id: m.id, app_id: appId });
      expect(error?.code).toBe("42501");
    }
  });
});

describe("due_admin_reminders", () => {
  it("lists pending requests per Forming cohort for admins only, service role only", async () => {
    const { m, appId } = await creator();
    const cohort = await createCohort(admin);
    await must(request(m, cohort, appId));
    const rows = ((await must(service.rpc("due_admin_reminders"))) as { user_id: string; kind: string; ref_id: string; extra: { count: number } }[])
      .filter((r) => r.ref_id === cohort);
    expect(rows.some((r) => r.user_id === admin.id && r.kind === "cohort_requests" && r.extra.count === 1)).toBe(true);
    expect(rows.some((r) => r.user_id === m.id)).toBe(false);
    expect((await admin.db.rpc("due_admin_reminders")).error?.code).toBe("42501");
  });
});
