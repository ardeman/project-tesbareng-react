// Connection details for the LOCAL Supabase stack (`npm run db:start`).
// Used by the seed script and the test suite; refuses anything that is not localhost.
import { execFileSync } from "node:child_process";

/** Password of every seeded member. Local only: production has the email provider disabled. */
export const DEV_PASSWORD = "tesbareng-local-only";

export interface LocalSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cached: LocalSupabase | null = null;

export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let status: Record<string, string>;
  try {
    status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch {
    throw new Error("Local Supabase is not running. Start it with `npm run db:start`.");
  }
  const url = status.API_URL;
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to touch non-local Supabase at ${url}.`);
  }
  cached = { url, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
  return cached;
}
