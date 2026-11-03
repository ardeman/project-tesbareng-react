# ADR-003 — Hosting: one static host for the web SPA

|  |  |
| --- | --- |
| **Status** | **Accepted — Vercel (2 November 2026)** |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **PRD ref** | PRD v2.2 §11, §11.4 step 7. Also `CLAUDE.md` (Stack), `docs/migrate_supabase.md` (Hosting prep) |

---

## Context

The web app (`web/`) is a static React + Vite SPA. It needs a free host with no credit card, HTTPS, a rewrite of every route to `index.html`, and two build-time env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

**The docs currently disagree:**

| Source | Says |
| --- | --- |
| PRD §11 and §11.4 | Cloudflare Pages, with `_redirects` (`/* /index.html 200`) |
| `docs/migrate_supabase.md` ("decisions already made") | Cloudflare Pages; create `web/public/_redirects` |
| `CLAUDE.md` (Stack) | **Vercel**: project root `web`, build `npm run build`, output `dist` |
| Code | `web/vercel.json` exists (rewrite `/(.*)` → `/index.html`). There is **no** `web/public/_redirects`. |

So the code is set up for Vercel while the PRD still says Cloudflare Pages. Nothing has been deployed yet, so either choice is cheap now and expensive later (OAuth redirect URIs, DNS, env vars and docs all depend on it).

## Options

| | Cloudflare Pages (free) | Vercel (Hobby, free) |
| --- | --- | --- |
| Card needed | No | No |
| SPA rewrite | `web/public/_redirects` | `web/vercel.json` (already in repo) |
| Bandwidth | No bandwidth cap on static assets | Monthly bandwidth allowance on Hobby |
| Terms | Free plan allows any use | Hobby is for **personal, non-commercial** use. A free community tool fits; paid sponsorship or ads later would not. |
| Preview deploys per branch | Yes | Yes |
| Fit with Supabase | Neutral | Neutral |

Check the current limits on each provider's pricing page before deciding; they change.

## Recommendation

Pick **one** host and make every doc and config match it. The ADR author's suggestion:

- **Vercel**, if the owner already chose it when writing `CLAUDE.md` and `vercel.json` (it is the most recent change in the repo). Then update PRD §11, §11.4 and `docs/migrate_supabase.md`.
- **Cloudflare Pages**, if the community may later take sponsorship or ads, or if bandwidth during an Awwwards feature is a worry. Then add `web/public/_redirects`, delete `web/vercel.json`, and update `CLAUDE.md`.

## Decision

**Vercel**, 2 November 2026. Owner confirmed via conversation. `web/vercel.json` (SPA rewrite) already in repo. `web/public/_redirects` tidak dibuat.

## Consequences (whichever host wins)

- Exactly one SPA rewrite file exists in the repo; the other host's file is deleted.
- PRD §11, §11.4, `CLAUDE.md` and `docs/migrate_supabase.md` name the same host.
- Google OAuth client and Supabase Auth list the chosen host's production and preview URLs as redirect URIs.
- Security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) are set in that host's config file, in one place.
- Deploys still happen only when the owner asks (`CLAUDE.md`).
