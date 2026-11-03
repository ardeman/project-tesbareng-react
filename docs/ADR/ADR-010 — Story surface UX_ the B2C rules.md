# ADR-010 — Story surface UX: the "B2C" rules

|  |  |
| --- | --- |
| **Status** | Accepted (2 November 2026) |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **Builds on** | ADR-001 (visual system, story execution sequence), ADR-008 (story page at `/`). ADR-001 wins on visuals and motion tokens; this ADR wins on audience, structure, conversion and content rules. |
| **Source** | Adapted from Antonio's personal design rules (*Human-Centered Design*: restraint, anti-generic tells, motion by frequency, copy, accessibility floor), translated to a consumer-facing page |
| **PRD ref** | PRD v2.2 §10, §13.0, §13.5, §15 |

---

## Context

The **story surface** (landing `/` and `/about`) faces individuals, not operators. It has three audiences with different questions:

| Audience | Question they arrive with | What they must leave with |
| --- | --- | --- |
| **Indie Android developer** (main audience) | "Can these people get me 12 testers for 14 days?" | Understands the cohort deal and joins (Google Group + sign in) |
| **Potential pure tester** | "Why would I test other people's apps?" | Understands badges and the "gotong royong" idea; joins a cohort |
| **Awwwards juror** | "Is this memorable, well made, and usable?" | Remembers the cohort ring; can find the work surface |

ADR-001 sets the look and the execution steps. It does not say how the page earns trust, what it must never claim, or how a visitor becomes a member. Consumer pages fail differently from tools: the risk is not "hard to use every day" but "looks like every other landing page, and nobody believes it".

## Decision

### 1. One signature moment, everything else quiet

The cohort ring (ADR-001 §4) is the **only** loud moment. Every other section is disciplined: one heading, short copy, real data, one action. Before calling a section done, remove the one thing that could go without losing meaning.

### 2. Section order follows the visitor's doubt

Derived from the product mechanics (ADR-001 Step 1), in this order:

1. **Hero** — billboard line + the ring's first frame + primary CTA "Gabung komunitas". The rule (12 testers, 14 days) is stated in the first viewport.
2. **The problem** — Google Play's closed-test requirement, in plain words.
3. **The ring** — the scroll-scrubbed signature moment: everyone tests, everyone gets tested.
4. **How a cohort runs** — Day 0, 2, 7, 13 as a ruled timeline.
5. **Pure testers and badges** — why someone without an app joins.
6. **Proof** — real numbers from finished cohorts (apps that reached "Ready to apply", median days). Shown **only** when real data exists; otherwise the section is omitted, never faked.
7. **Join** — the two steps (Google Group, then sign in with Google), the WhatsApp community note, and a link to the app list.
8. **FAQ + footer** — rules, privacy summary (masked emails, ADR-005), credits for photos and illustrations.

### 3. One conversion path

- Primary CTA everywhere on the page is the same: **"Gabung komunitas"**, leading to the join steps. No competing primary buttons.
- Secondary link for people who just want to look: **"Lihat daftar app"** → `/apps` (ADR-008).
- Signing in is never required to read the story or browse apps (PRD §7: visitors see everything public).
- The join steps state the obligations up front (opt in within 48 hours, check in at milestones). Honest friction beats members who ghost a cohort.

### 4. Trust: real or nothing

- Only real community apps, member photos and names **with permission**. No invented app logos, testimonials, counters or "trusted by" rows (ADR-001 §2.7).
- Numbers on the page come from the live views (`app_stats`, `profile_stats`), not hard-coded copy. If the database is empty, the sentence that uses the number is not rendered.
- Stock or documentary photos (e.g. `web/public/about/*`) carry credits from `credits.json`.
- Privacy is stated plainly near the join step: emails are masked for everyone, phone numbers are never collected.

### 5. Avoid the generic landing-page tells

In addition to ADR-001 §2.7, never ship these as unexamined defaults:

- Icon-in-a-circle + bold headline + grey paragraph, repeated three times.
- Identical feature cards with no hierarchy between them.
- A centred hero over a grid of icon cards.
- Three or more typefaces, or a new font size per section. The story surface uses **display face + text face only**; the mono face (if any) is for data in the work surface.
- Emoji standing in for icons.

### 6. Motion: rare moments may delight

Applying the frequency rule from ADR-009 §9: the story page is visited once or a few times, so it may afford more motion than the work surface, but only where it **explains** something:

- The ring scrub explains assignment. Section entrances may stamp in (ADR-001 §3). Nothing loops forever, nothing follows the cursor.
- No animation delays reading the first viewport or the CTA. The hero text and CTA are visible on first paint, without JS.
- `prefers-reduced-motion`: drop movement (scrub, slides, stamps) but keep opacity/colour changes that show state; the ring shows its completed static frame.
- Hover effects gated behind `@media (hover: hover) and (pointer: fine)`.

### 7. Mobile first, low-end Android first

Most developers in the community open the page from WhatsApp on Android.

- Design at 375 px first; the ring must read on a phone (fewer, larger nodes, or the static frame below a size threshold).
- Performance budget from ADR-001 (story chunk < 80 KB gzip, LCP < 2.5 s on a mid-range Android over 4G). The hero image or ring frame is the LCP element and is preloaded.
- Tap targets ≥ 44 px; no hover-only information.

### 8. Sharing and discovery

- The page is linked mostly from WhatsApp and Google Groups, so **Open Graph** image, title and description are designed per route (ADR-001 submission checklist), in Bahasa Indonesia.
- Semantic headings and landmarks; one `h1`; the ring has a text description (ADR-001 §4).
- Page `lang="id"`. Any English text (Awwwards description) lives off-page.

### 9. Copy

- Bahasa Indonesia, warm and direct, written for an indie developer, not a corporation. Short sentences; the "gotong royong" idea carries the tone.
- Every claim is checkable: "14 tester untuk setiap app" is true by construction (ADR-007); "Dipercaya ribuan developer" is not allowed.
- No corporate filler ("Leverage", "unlock", "seamless").

## Where the story surface differs from the work surface

| Topic | Work surface (ADR-009) | Story surface (this ADR) |
| --- | --- | --- |
| Goal | Get today's obligation done fast | Understand, trust, join |
| Density | Sheet-like, 3–4 fields per row | One idea per section |
| Motion | Press states; almost no animation on frequent actions | One scroll-scrubbed moment; stamp entrances |
| Sizes | ADR-001 work column | ADR-001 story column (larger type, 3 px borders, 6 px shadows) |
| Primary action | Changes per screen and role | Always "Gabung komunitas" |
| JS | No GSAP | GSAP + ScrollTrigger for the ring only, in its own chunk |

## Pre-ship check (story surface)

- First viewport states the rule and shows the CTA, with JS off.
- Exactly one loud moment (the ring); every other section passes the "remove one thing" test.
- No invented numbers, logos, testimonials or uncredited media.
- Proof section hidden when no real data exists.
- Reduced motion and keyboard walkthrough pass; ring has a text alternative.
- 375 px layout checked on a real Android; LCP within budget.
- OG image and description set; `lang="id"`.
- ADR-001 Step 4 scoring done by a fresh reviewer.

## Consequences

- The story page needs read access to live stats (already public, ADR-004) and must handle an empty database gracefully.
- Section 6 (proof) cannot ship until at least one cohort has closed; the page must look complete without it.
- Copy and photos need written permission from members before launch; track permissions alongside `credits.json`.
- If ADR-008 is rejected (story stays at `/about`), this ADR still applies to `/about`, and the juror path in §3 must change.
