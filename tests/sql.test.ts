// SQL unit tests: mask_email, check constraints, and the maths of the computed
// stats views.
import { beforeAll, describe, expect, it } from "vitest";
import { ago, anon, DAY_MS, member, must, profileStats, service, stats, uniq, type Member } from "./helpers";

describe("mask_email", () => {
  it.each([
    ["budi.santoso@gmail.com", "bu*****@gmail.com"],
    ["ab@gmail.com", "ab*****@gmail.com"],
    ["a@gmail.com", "a*****@gmail.com"],
    ["Siti.Rahma@Gmail.com", "si*****@gmail.com"],
    ["  dewi@yahoo.co.id ", "de*****@yahoo.co.id"],
  ])("%s -> %s", async (input, expected) => {
    expect(await must(anon().rpc("mask_email", { email: input }))).toBe(expected);
  });

  it("always uses five asterisks regardless of local-part length", async () => {
    expect(await must(anon().rpc("mask_email", { email: "abcdefghijklmnopqrstuvwxyz@gmail.com" }))).toBe("ab*****@gmail.com");
  });

  it("never leaks more than two characters of the local part", async () => {
    const masked = (await must(anon().rpc("mask_email", { email: "rahasia.sekali@gmail.com" }))) as string;
    expect(masked).not.toContain("rahasia");
    expect(masked.split("@")[0].replace(/\*/g, "")).toHaveLength(2);
  });

  it("keeps multi-byte characters whole", async () => {
    expect(await must(anon().rpc("mask_email", { email: "ñúñez@gmail.com" }))).toBe("ñú*****@gmail.com");
  });

  it.each(["", "budi", "@gmail.com", "budi@"])("rejects %j", async (input) => {
    const { error } = await anon().rpc("mask_email", { email: input });
    expect(error?.hint).toBe("invalid-argument");
  });
});

describe("check constraints (database rejects bad data even without the RPC layer)", () => {
  let creator: Member;
  let appId: string;

  beforeAll(async () => {
    creator = await member("rina", "Rina Kusumawati");
    appId = await must(service.from("apps").insert(appRow(creator.id)).select("id").single()).then((r) => r.id);
  });

  function appRow(creatorId: string, over: Record<string, unknown> = {}) {
    const n = uniq();
    return {
      name: "Kas RT Digital",
      description: "Catat iuran warga.",
      opt_in_url: `https://play.google.com/apps/testing/id.rina.kasrt${n}`,
      package_name: `id.rina.kasrt${n}`,
      creator_id: creatorId,
      ...over,
    };
  }
  const testerRow = (over: Record<string, unknown> = {}) => ({
    app_id: appId,
    display_name: "Wulan Sari",
    masked_email: "wu*****@gmail.com",
    opted_in_at: new Date().toISOString(),
    added_by: "creator",
    ...over,
  });
  const buildRow = (over: Record<string, unknown> = {}) => ({
    app_id: appId,
    version_name: "1.0.0",
    uploaded_at: new Date().toISOString(),
    changelog: "Rilis awal",
    ...over,
  });
  const violates = async (table: string, row: Record<string, unknown>) => {
    const { error } = await service.from(table).insert(row);
    expect(error?.code).toBe("23514");
  };

  it("apps: lengths, URL prefixes, package format, status", async () => {
    await violates("apps", appRow(creator.id, { name: "x".repeat(51) }));
    await violates("apps", appRow(creator.id, { name: "   " }));
    await violates("apps", appRow(creator.id, { description: "x".repeat(281) }));
    await violates("apps", appRow(creator.id, { feedback_guide: "x".repeat(501) }));
    await violates("apps", appRow(creator.id, { opt_in_url: "https://play.google.com/store/apps/details?id=a.b" }));
    await violates("apps", appRow(creator.id, { opt_in_url: "https://play.google.com/apps/testing/" }));
    await violates("apps", appRow(creator.id, { store_url: "https://apkpure.com/kasrt" }));
    await violates("apps", appRow(creator.id, { package_name: "bukan paket" }));
    await violates("apps", appRow(creator.id, { status: "approved" }));
    await must(service.from("apps").insert(appRow(creator.id, { name: "x".repeat(50), package_name: null })));
  });

  it("apps: one live app per package name", async () => {
    const pkg = `id.rina.unik${uniq()}`;
    await must(service.from("apps").insert(appRow(creator.id, { package_name: pkg })));
    const { error } = await service.from("apps").insert(appRow(creator.id, { package_name: pkg }));
    expect(error?.code).toBe("23505");
  });

  it("testers: masked_email can never hold a full address", async () => {
    await violates("testers", testerRow({ masked_email: "wulan.sari@gmail.com" }));
    await violates("testers", testerRow({ masked_email: "wul*****@gmail.com" }));
    await violates("testers", testerRow({ masked_email: "wu****@gmail.com" }));
  });

  it("testers: note 140, summary 500, status and added_by sets", async () => {
    await violates("testers", testerRow({ note: "x".repeat(141) }));
    await violates("testers", testerRow({ feedback_summary: "x".repeat(501) }));
    await violates("testers", testerRow({ status: "banned" }));
    await violates("testers", testerRow({ added_by: "admin" }));
    await must(service.from("testers").insert(testerRow({ note: "x".repeat(140), feedback_summary: "x".repeat(500) })));
  });

  it("profiles: masked_email can never hold a full address", async () => {
    const { error } = await service.from("profiles").update({ masked_email: creator.email }).eq("id", creator.id);
    expect(error?.code).toBe("23514");
  });

  it("builds: versionName 40, changelog 140", async () => {
    await violates("builds", buildRow({ version_name: "v".repeat(41) }));
    await violates("builds", buildRow({ changelog: "c".repeat(141) }));
    await violates("builds", buildRow({ changelog: " " }));
    await must(service.from("builds").insert(buildRow({ version_name: "v".repeat(40), changelog: "c".repeat(140) })));
  });
});

describe("app_stats", () => {
  let creator: Member;

  beforeAll(async () => {
    creator = await member("fajar", "Fajar Nugroho");
  });

  async function newApp(creatorId = creator.id, over: Record<string, unknown> = {}) {
    const n = uniq();
    const row = await must(
      service
        .from("apps")
        .insert({
          name: "Stat App",
          description: "Uji statistik.",
          opt_in_url: `https://play.google.com/apps/testing/id.stat.app${n}`,
          creator_id: creatorId,
          ...over,
        })
        .select("id")
        .single(),
    );
    return row.id as string;
  }
  const entry = (appId: string, over: Record<string, unknown>) => ({
    app_id: appId,
    display_name: "Tester",
    masked_email: "te*****@gmail.com",
    opted_in_at: ago(3 * DAY_MS),
    added_by: "creator",
    ...over,
  });

  it("is all zero for an app without testers or builds", async () => {
    const appId = await newApp();
    expect(await stats(appId)).toMatchObject({
      active_tester_count: 0,
      eligible_count: 0,
      feedback_sent_count: 0,
      feedback_verified_count: 0,
      replied_count: 0,
      build_count: 0,
      last_build_at: null,
    });
  });

  it("counts only active testers; eligible at 14 days, not at 13 days 23 h", async () => {
    const appId = await newApp();
    await must(
      service.from("testers").insert([
        entry(appId, { opted_in_at: ago(14 * DAY_MS + 60_000), feedback_sent: true, feedback_verified: true, replied: true }),
        entry(appId, { opted_in_at: ago(14 * DAY_MS - 3_600_000), feedback_sent: true }),
        entry(appId, {}),
        entry(appId, { status: "left", opted_in_at: ago(30 * DAY_MS), left_at: ago(DAY_MS), feedback_sent: true, feedback_verified: true, replied: true }),
        entry(appId, { status: "removed", opted_in_at: ago(30 * DAY_MS), feedback_sent: true, feedback_verified: true, replied: true }),
      ], { defaultToNull: false }),
    );
    expect(await stats(appId)).toMatchObject({
      active_tester_count: 3,
      eligible_count: 1,
      feedback_sent_count: 2,
      feedback_verified_count: 1,
      replied_count: 1,
    });
  });

  it("build_count and last_build_at use the max uploaded_at, not insertion order", async () => {
    const appId = await newApp();
    const now = Date.now();
    const at = (d: number) => new Date(now - d * DAY_MS).toISOString();
    await must(
      service.from("builds").insert(
        [at(2), at(9), at(5)].map((uploaded_at, i) => ({ app_id: appId, version_name: `1.0.${i}`, uploaded_at, changelog: "x" })),
      ),
    );
    const s = await stats(appId);
    expect(s.build_count).toBe(3);
    expect(new Date(s.last_build_at as string).toISOString()).toBe(at(2));
  });

  it("is hidden for soft-deleted apps (visitors), visible to admin", async () => {
    const appId = await newApp(creator.id, { deleted: true });
    const { data } = await anon().from("app_stats").select("app_id").eq("app_id", appId);
    expect(data).toEqual([]);
    const admin = await member("yusuf", "Yusuf Hidayat", "admin");
    const { data: seen } = await admin.db.from("app_stats").select("app_id").eq("app_id", appId);
    expect(seen).toHaveLength(1);
  });

  describe("profile_stats (reciprocity) and the creator numbers on app_stats", () => {
    let tester: Member;
    let ownAppId: string;

    beforeAll(async () => {
      tester = await member("bayu", "Bayu Pratama");
      const opted = Date.now() - 30 * DAY_MS;
      const iso = (ms: number) => new Date(ms).toISOString();
      const rows = [
        { status: "active", opted_in_at: ago(DAY_MS), feedback_sent: true, feedback_verified: true },
        { status: "left", opted_in_at: iso(opted), left_at: iso(opted + 14 * DAY_MS), feedback_sent: true },
        { status: "left", opted_in_at: iso(opted), left_at: iso(opted + 14 * DAY_MS - 1000), feedback_sent: true },
        { status: "left", opted_in_at: ago(40 * DAY_MS), left_at: null },
        { status: "removed", opted_in_at: ago(40 * DAY_MS), left_at: ago(DAY_MS), feedback_sent: true, feedback_verified: true },
      ];
      for (const r of rows) {
        const appId = await newApp();
        await must(service.from("testers").insert(entry(appId, { ...r, user_id: tester.id, added_by: "self" })));
      }
      const deletedApp = await newApp(creator.id, { deleted: true });
      await must(
        service
          .from("testers")
          .insert(entry(deletedApp, { user_id: tester.id, added_by: "self", feedback_sent: true, feedback_verified: true })),
      );
      ownAppId = await newApp(tester.id);
    });

    it("counts Active, and Left only after 14+ days; never Removed or deleted apps", async () => {
      expect(await profileStats(tester.id)).toMatchObject({
        testing_count: 2,
        feedback_sent_count: 3,
        feedback_verified_count: 1,
        apps_created_count: 1,
      });
    });

    it("apps_created_count excludes soft-deleted apps", async () => {
      const ps = await profileStats(creator.id);
      const { count } = await service.from("apps").select("id", { count: "exact", head: true }).eq("creator_id", creator.id).eq("deleted", false);
      expect(ps.apps_created_count).toBe(count);
    });

    it("app_stats carries the creator's reciprocity numbers", async () => {
      expect(await stats(ownAppId)).toMatchObject({
        creator_testing_count: 2,
        creator_feedback_sent_count: 3,
        creator_feedback_verified_count: 1,
      });
    });
  });
});
