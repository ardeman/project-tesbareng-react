# ADR-008 — Routing: story page at `/`, app list at `/apps`

|  |  |
| --- | --- |
| **Status** | **Proposed — needs the owner's decision** (answers PRD §17 Q9) |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **PRD ref** | PRD v2.2 §10, §13.0, §17 Q9. ADR-001 (Context, Step 1) |
| **Code** | `web/src/main.tsx` |

---

## Context

The routes disagree across documents:

| Source | `/` is |
| --- | --- |
| PRD §10 and `web/src/main.tsx` today | App list (`AppList`); the story lives at `/about` |
| ADR-001 | "landing (`/`) and About (`/about`)" form the story surface |
| PRD §17 Q9 | Open: should logged-out visitors land on the story page at `/`, with the app list moved to `/apps`? |

This matters for the Awwwards goal: jurors open the home URL. If `/` is a work screen (a list of app cards), the first impression is the work surface, not the story surface ADR-001 designs for.

`/apps` is unused today (`/apps/new`, `/apps/:id` and `/apps/:id/edit` exist), so moving the list there is cheap.

## Options

| Option | Good | Bad |
| --- | --- | --- |
| **A. `/` = story for everyone; `/apps` = app list** | One URL, one page; best for jurors, sharing and SEO; matches ADR-001 | Returning members need one extra click, unless the header and post-login redirect send them to `/apps` |
| **B. `/` = story when logged out, app list when logged in** | Members land on their work | Same URL renders two different pages; harder to share, cache and test; jurors who sign in lose the story |
| **C. Keep `/` = app list; story at `/about`** | No change | Jurors see the work surface first; contradicts ADR-001 |

## Recommendation

**Option A.**

- `/` renders the story surface (landing). `/about` keeps the longer community rules and how-it-works guide, or redirects to a section of `/` if merged.
- `/apps` renders the app list. The header's primary nav item for the app list points to `/apps`.
- After Google sign-in, redirect to where the user came from, or `/apps` by default (not `/`).
- Story-surface JS (GSAP, the ring) stays in the landing route's own chunk (ADR-001 performance budget); `/apps` never loads it.

## Decision

_To be filled in by the owner: chosen option, date. Then answer PRD §17 Q9 and update PRD §10._

## Consequences (if A is accepted)

- Update `web/src/main.tsx`: add `/apps` → `AppList`, make `/` the landing page; keep the 404 route.
- Update PRD §10 (Pages table), `CLAUDE.md` (page route list) and in-app links that point to `/` for the list.
- No URL redirect is needed: `/` still exists, only its content changes. Members who bookmarked `/` for the list land on the story page, whose primary CTA and header link go to `/apps`.
- Google OAuth redirect targets stay the same origin; only the in-app post-login path changes.
