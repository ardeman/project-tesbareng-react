// Permissions (PRD §7) as seen from the client: reads allowed, every direct write
// denied, full emails unreadable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, checklist, codeOf, createApp, createCohort, forceActive, member, must, service, type Member } from "./helpers";

let creator: Member;
let tester: Member;
let other: Member;
let admin: Member;
let appId: string;
let entryId: string;
let manualId: string;
let deletedAppId: string;
let cohortId: string;
let assignmentId: string;
let checkInId: string;

beforeAll(async () => {
  [creator, tester, other, admin] = await Promise.all([
    member("rina.kusuma", "Rina Kusumawati"),
    member("bayu.pratama", "Bayu Pratama"),
    member("dimas.ar", "Dimas Aditya"),
    member("yusuf.admin", "Yusuf Hidayat", "admin"),
  ]);
  appId = await createApp(creator);
  await must(tester.db.rpc("join_as_tester", { p_app_id: appId, p_checklist: checklist }));
  entryId = (await must(service.from("testers").select("id").eq("app_id", appId).eq("user_id", tester.id).single())).id;
  manualId = (await must(
    creator.db.rpc("add_manual_tester", { p_app_id: appId, p_display_name: "Wulan Sari", p_email: "wulan.sari@gmail.com" }),
  )) as string;
  await must(creator.db.rpc("add_build", { p_app_id: appId, p_version_name: "1.0.1", p_uploaded_at: "2026-10-30", p_changelog: "Perbaiki crash" }));
  deletedAppId = await createApp(creator);
  await must(creator.db.rpc("delete_app", { p_app_id: deletedAppId }));

  // A cohort with the creator's app and the tester as a pure tester, started by hand
  // (start_cohort comes later), one assignment and one check-in.
  cohortId = await createCohort(admin);
  await must(admin.db.rpc("add_cohort_member", { p_cohort_id: cohortId, p_user_id: creator.id, p_app_id: appId }));
  await must(admin.db.rpc("add_cohort_member", { p_cohort_id: cohortId, p_user_id: tester.id, p_app_id: null }));
  await must(admin.db.rpc("set_cohort_link", { p_cohort_id: cohortId, p_url: "https://chat.whatsapp.com/IzinRahasia" }));
  await forceActive(cohortId, 3);
  assignmentId = (await must(service.from("assignments").insert({ cohort_id: cohortId, tester_user_id: tester.id, app_id: appId }).select("id").single())).id;
  checkInId = (await must(service.from("check_ins").insert({ tester_id: entryId, kind: "used_app" }).select("id").single())).id;
});

const roles = () => ({ visitor: anon(), member: other.db, tester: tester.db, creator: creator.db, admin: admin.db });

describe("public reads", () => {
  it.each(["visitor", "member", "tester", "creator", "admin"] as const)("%s can read apps, testers, builds, profiles and stats", async (role) => {
    const db = roles()[role];
    expect(await must(db.from("apps").select("id").eq("id", appId))).toHaveLength(1);
    expect(await must(db.from("testers").select("id").eq("app_id", appId))).toHaveLength(2);
    expect(await must(db.from("builds").select("id").eq("app_id", appId))).toHaveLength(1);
    expect(await must(db.from("profiles").select("id").eq("id", tester.id))).toHaveLength(1);
    expect(await must(db.from("app_stats").select("app_id").eq("app_id", appId))).toHaveLength(1);
    expect(await must(db.from("profile_stats").select("profile_id").eq("profile_id", tester.id))).toHaveLength(1);
  });

  it.each(["visitor", "member", "tester", "creator", "admin"] as const)("%s can read cohorts, members, assignments and check-ins", async (role) => {
    const db = roles()[role];
    expect(await must(db.from("cohorts").select("id").eq("id", cohortId))).toHaveLength(1);
    expect(await must(db.from("cohort_members").select("user_id").eq("cohort_id", cohortId))).toHaveLength(2);
    expect(await must(db.from("assignments").select("id").eq("cohort_id", cohortId))).toHaveLength(1);
    expect(await must(db.from("check_ins").select("id").eq("tester_id", entryId))).toHaveLength(1);
  });

  it("the cohort WhatsApp link is readable only by that cohort's members and the admin (FR-50)", async () => {
    for (const db of [tester.db, creator.db, admin.db]) {
      expect(await must(db.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", cohortId))).toHaveLength(1);
    }
    for (const db of [anon(), other.db]) {
      expect(await must(db.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", cohortId))).toHaveLength(0);
    }
  });

  it("anyone can list a member's entries across apps (replaces the collection-group query)", async () => {
    const rows = await must(anon().from("testers").select("app_id").eq("user_id", tester.id));
    expect(rows.map((r) => r.app_id)).toContain(appId);
  });

  it("soft-deleted apps are hidden from everyone but admin, including their creator", async () => {
    for (const db of [anon(), other.db, creator.db]) {
      expect(await must(db.from("apps").select("id").eq("id", deletedAppId))).toHaveLength(0);
    }
    expect(await must(admin.db.from("apps").select("id").eq("id", deletedAppId))).toHaveLength(1);
  });
});

describe("full email never readable", () => {
  it("profiles and testers have no email column", async () => {
    const p = await must(anon().from("profiles").select("*").eq("id", tester.id).single());
    expect(Object.keys(p)).not.toContain("email");
    expect(p.masked_email).toBe("ba*****@gmail.com");
    const t = await must(anon().from("testers").select("*").eq("id", entryId).single());
    expect(Object.keys(t)).not.toContain("email");
  });

  it.each(["visitor", "member", "creator"] as const)("%s finds no full address in any public table or view", async (role) => {
    const db = roles()[role];
    const known = [creator.email, tester.email, other.email, admin.email, "wulan.sari@gmail.com"];
    for (const table of ["profiles", "apps", "testers", "builds", "app_stats", "profile_stats", "cohorts", "cohort_members", "assignments", "check_ins", "cohort_links", "email_listings"]) {
      const text = JSON.stringify(await must(db.from(table).select("*")));
      for (const email of known) expect(text, `${table} leaks ${email}`).not.toContain(email);
      for (const addr of text.match(/[^\s"@]+@[^\s"@]+/g) ?? []) expect(addr, `${table}: ${addr}`).toContain("*****@");
    }
  });

  it("the auth and private schemas are not reachable through the API", async () => {
    const users = await other.db.schema("auth").from("users").select("email");
    expect(users.error).not.toBeNull();
    const priv = await other.db.schema("private").rpc("upsert_profile", { uid: other.id });
    expect(priv.error).not.toBeNull();
  });

  it("only the owner sees their own full email (from their session)", async () => {
    const { data } = await tester.db.auth.getUser();
    expect(data.user?.email).toBe(tester.email);
  });
});

describe("direct table writes are denied for every client role", () => {
  const roleNames = ["visitor", "member", "tester", "creator", "admin"] as const;
  const denied = async (p: PromiseLike<{ error: { code: string } | null }>) => {
    const { error } = await p;
    expect(error?.code).toBe("42501");
  };

  it.each(roleNames)("%s cannot insert, update or delete apps", async (role) => {
    const db = roles()[role];
    await denied(db.from("apps").insert({ name: "x", description: "x", opt_in_url: "https://play.google.com/apps/testing/a.b", creator_id: creator.id }));
    await denied(db.from("apps").update({ name: "Diubah" }).eq("id", appId));
    await denied(db.from("apps").update({ deleted: false }).eq("id", deletedAppId));
    await denied(db.from("apps").delete().eq("id", appId));
  });

  it.each(roleNames)("%s cannot insert, update or delete tester entries", async (role) => {
    const db = roles()[role];
    await denied(db.from("testers").insert({ app_id: appId, display_name: "x", masked_email: "xx*****@gmail.com", opted_in_at: new Date().toISOString(), added_by: "self" }));
    await denied(db.from("testers").update({ feedback_sent: true }).eq("id", entryId));
    await denied(db.from("testers").update({ feedback_verified: true }).eq("id", entryId));
    await denied(db.from("testers").delete().eq("id", manualId));
  });

  it.each(roleNames)("%s cannot write builds", async (role) => {
    const db = roles()[role];
    await denied(db.from("builds").insert({ app_id: appId, version_name: "9", uploaded_at: new Date().toISOString(), changelog: "x" }));
    await denied(db.from("builds").update({ changelog: "Edit" }).eq("app_id", appId));
    await denied(db.from("builds").delete().eq("app_id", appId));
  });

  it.each(roleNames)("%s cannot write profiles (no role escalation, no counts)", async (role) => {
    const db = roles()[role];
    await denied(db.from("profiles").update({ role: "admin" }).eq("id", tester.id));
    await denied(db.from("profiles").update({ display_name: "Ganti" }).eq("id", other.id));
    await denied(db.from("profiles").update({ email_reminders: false }).eq("id", other.id));
    await denied(db.from("profiles").insert({ id: other.id, display_name: "x", masked_email: "xx*****@gmail.com" }));
    await denied(db.from("profiles").delete().eq("id", other.id));
  });

  it.each(roleNames)("%s cannot write cohorts, members, assignments, check-ins or links", async (role) => {
    const db = roles()[role];
    await denied(db.from("cohorts").insert({ name: "Cohort liar" }));
    await denied(db.from("cohorts").update({ status: "closed" }).eq("id", cohortId));
    await denied(db.from("cohorts").delete().eq("id", cohortId));
    await denied(db.from("cohort_members").insert({ cohort_id: cohortId, user_id: other.id }));
    await denied(db.from("cohort_members").update({ standing: "good" }).eq("cohort_id", cohortId));
    await denied(db.from("cohort_members").delete().eq("cohort_id", cohortId));
    await denied(db.from("assignments").insert({ cohort_id: cohortId, tester_user_id: creator.id, app_id: appId }));
    await denied(db.from("assignments").update({ state: "reassigned" }).eq("id", assignmentId));
    await denied(db.from("assignments").delete().eq("id", assignmentId));
    await denied(db.from("check_ins").insert({ tester_id: entryId, kind: "still_opted_in" }));
    await denied(db.from("check_ins").update({ kind: "still_opted_in" }).eq("id", checkInId));
    await denied(db.from("check_ins").delete().eq("id", checkInId));
    await denied(db.from("cohort_links").insert({ cohort_id: cohortId, whatsapp_group_url: "https://chat.whatsapp.com/Palsu" }));
    await denied(db.from("cohort_links").update({ whatsapp_group_url: "https://chat.whatsapp.com/Palsu" }).eq("cohort_id", cohortId));
    await denied(db.from("cohort_links").delete().eq("cohort_id", cohortId));
    await denied(db.from("email_listings").insert({ app_id: appId, user_id: other.id }));
    await denied(db.from("email_listings").update({ listed_at: new Date().toISOString() }).eq("app_id", appId));
    await denied(db.from("email_listings").delete().eq("app_id", appId));
  });

  it.each(roleNames)("%s cannot write the stats views", async (role) => {
    const db = roles()[role];
    expect(await codeOf(db.from("app_stats").update({ active_tester_count: 12 }).eq("app_id", appId))).not.toBeNull();
    expect(await codeOf(db.from("profile_stats").update({ testing_count: 99 }).eq("profile_id", tester.id))).not.toBeNull();
  });

  it("the data is unchanged after all those attempts", async () => {
    const app = await must(service.from("apps").select("name, deleted").eq("id", appId).single());
    expect(app).toEqual({ name: "Jadwal Sholat Widget", deleted: false });
    const p = await must(service.from("profiles").select("role").eq("id", tester.id).single());
    expect(p.role).toBe("member");
    expect(await must(service.from("builds").select("id").eq("app_id", appId))).toHaveLength(1);
    const c = await must(service.from("cohorts").select("status").eq("id", cohortId).single());
    expect(c.status).toBe("active");
    expect(await must(service.from("cohort_members").select("user_id, standing").eq("cohort_id", cohortId))).toHaveLength(2);
    const a = await must(service.from("assignments").select("state").eq("id", assignmentId).single());
    expect(a.state).toBe("open");
    expect(await must(service.from("check_ins").select("kind").eq("id", checkInId).single())).toEqual({ kind: "used_app" });
    const link = await must(service.from("cohort_links").select("whatsapp_group_url").eq("cohort_id", cohortId).single());
    expect(link.whatsapp_group_url).toBe("https://chat.whatsapp.com/IzinRahasia");
  });
});

describe("unknown tables", () => {
  it("are not exposed", async () => {
    const db: SupabaseClient = other.db;
    expect((await db.from("secrets").select("*")).error).not.toBeNull();
  });
});
