// Permissions (PRD §7) as seen from the client: reads allowed, every direct write
// denied, full emails unreadable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, checklist, codeOf, createApp, member, must, service, type Member } from "./helpers";

let creator: Member;
let tester: Member;
let other: Member;
let admin: Member;
let appId: string;
let entryId: string;
let manualId: string;
let deletedAppId: string;

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
    for (const table of ["profiles", "apps", "testers", "builds", "app_stats", "profile_stats"]) {
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
  });
});

describe("unknown tables", () => {
  it("are not exposed", async () => {
    const db: SupabaseClient = other.db;
    expect((await db.from("secrets").select("*")).error).not.toBeNull();
  });
});
