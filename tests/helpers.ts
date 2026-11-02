import { randomUUID } from "node:crypto";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, expect } from "vitest";
import { DEV_PASSWORD, localSupabase } from "../scripts/local";

const { url, anonKey, serviceRoleKey } = localSupabase();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Bypasses RLS; used only to arrange fixtures and to clean up. */
export const service = createClient(url, serviceRoleKey, opts);
export const anon = () => createClient(url, anonKey, opts);

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RUN = randomUUID().slice(0, 8);
let seq = 0;
export const uniq = () => `${RUN}${++seq}`;

export interface Member {
  id: string;
  email: string;
  name: string;
  db: SupabaseClient;
}

const created: string[] = [];

/** A signed-in member. The profile comes from the auth trigger, like a real Google sign-in. */
export async function member(local: string, name: string, role: "member" | "admin" = "member"): Promise<Member> {
  const email = `${local}.${uniq()}@gmail.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name, avatar_url: `https://lh3.googleusercontent.com/a/${local}` },
  });
  if (error) throw error;
  created.push(data.user.id);
  if (role === "admin") await must(service.from("profiles").update({ role: "admin" }).eq("id", data.user.id));
  const db = anon();
  const signIn = await db.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, name, db };
}

/** Removes everything the test file's members created (apps, entries, builds, accounts). */
afterAll(async () => {
  if (created.length === 0) return;
  const apps = await must(service.from("apps").select("id").in("creator_id", created));
  const appIds = apps.map((a: { id: string }) => a.id);
  if (appIds.length) {
    await must(service.from("builds").delete().in("app_id", appIds));
    await must(service.from("testers").delete().in("app_id", appIds));
  }
  await must(service.from("testers").delete().in("user_id", created));
  if (appIds.length) await must(service.from("apps").delete().in("id", appIds));
  for (const id of created) await service.auth.admin.deleteUser(id);
});

export async function must<T>(p: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${error.code} ${error.hint ?? ""} ${error.message}`);
  return data;
}

/** The contract code of a failed call: `hint` for RPC errors, SQLSTATE otherwise. */
export async function codeOf(p: PromiseLike<{ error: PostgrestError | null }>): Promise<string | null> {
  const { error } = await p;
  if (!error) return null;
  return error.hint && /^[a-z-]+$/.test(error.hint) ? error.hint : error.code;
}

export async function expectCode(p: PromiseLike<{ error: PostgrestError | null }>, code: string, message?: RegExp) {
  const { error } = await p;
  expect(error, `expected ${code}`).not.toBeNull();
  const got = error!.hint && /^[a-z-]+$/.test(error!.hint) ? error!.hint : error!.code;
  expect(got).toBe(code);
  if (message) expect(error!.message).toMatch(message);
}

export const checklist = { joinedGroup: true, optedIn: true, installed: true };

export function appInput(over: Record<string, unknown> = {}) {
  const n = uniq();
  return {
    p_name: "Jadwal Sholat Widget",
    p_description: "Widget jadwal sholat ringan dengan pengingat adzan untuk kota-kota di Indonesia.",
    p_opt_in_url: `https://play.google.com/apps/testing/id.fajardev.sholat${n}`,
    p_package_name: `id.fajardev.sholat${n}`,
    p_feedback_guide: "Apakah widget tetap update setelah HP restart?",
    p_group_confirmed: true,
    ...over,
  };
}

/**
 * Creates an app through the RPC, then backdates it so fixtures do not use up the
 * creator's 5-per-24h quota (the rate-limit test calls the RPC directly).
 */
export async function createApp(m: Member, over: Record<string, unknown> = {}): Promise<string> {
  const id = (await must(m.db.rpc("create_app", appInput(over)))) as string;
  await must(service.from("apps").update({ created_at: new Date(Date.now() - 2 * DAY_MS).toISOString() }).eq("id", id));
  return id;
}

export async function stats(appId: string) {
  return must(anon().from("app_stats").select("*").eq("app_id", appId).single()) as Promise<Record<string, number | string | null>>;
}

export async function profileStats(id: string) {
  return must(anon().from("profile_stats").select("*").eq("profile_id", id).single()) as Promise<Record<string, number>>;
}

export async function entryOf(appId: string, userId: string) {
  return must(service.from("testers").select("*").eq("app_id", appId).eq("user_id", userId).single()) as Promise<
    Record<string, unknown>
  >;
}

export const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
