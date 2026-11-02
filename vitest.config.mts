import { defineConfig } from "vitest/config";

// Runs against the local Supabase stack (`npm run db:start`). Each test creates its own
// members and apps with unique names and removes them afterwards, so seed data is untouched.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
