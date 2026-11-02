# ADR-001 — TesBareng Design System

|  |  |
| --- | --- |
| **Status** | Accepted |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **Goal** | Awwwards Honorable Mention minimum; Site of the Day as target |
| **PRD ref** | §13 Design Direction and UI Guidelines (PRD v2.1) |

---

## Context

TesBareng has two distinct surfaces that need different treatment:

- **Story surface** — the landing / About page. This is what Awwwards jurors open first. It must earn the Design (40%) and Creativity (20%) scores alone.
- **Work surface** — app list, app detail, tester table, cohort matrix, Tugas saya, forms, admin. These must earn the Usability (30%) score. Jurors click through.

Two external skill libraries cover these surfaces:

| Library | Repo | Role |
| --- | --- | --- |
| **mengto/skills** | `https://github.com/mengto/skills` | Story surface: Awwwards-quality motion, cinematic scroll, GSAP/Lenis, Three.js shaders, anti-slop audit |
| **taste-skill** | `https://github.com/Leonxlnx/taste-skill` | Work surface: app-screen route, design tokens, inspect loop |

This ADR defines which library runs on which surface, the install order, and the exact sequence Claude Code must follow.

---

## Decision

### Install both libraries before doing any design work

> **If either library is not installed, install it first. Do not skip ahead.**

**Check and install mengto/skills:**

```bash
# Check if already present
ls agent-skills/web-design/build-awwwards-quality-sites/SKILL.md 2>/dev/null \
  && echo "mengto/skills present" \
  || (git clone --depth 1 https://github.com/mengto/skills.git /tmp/mengto-skills \
      && cp -r /tmp/mengto-skills/agent-skills ./agent-skills \
      && echo "mengto/skills installed")
```

**Check and install taste-skill:**

```bash
# Check if already present
ls .taste-skill/SKILL.md 2>/dev/null \
  && echo "taste-skill present" \
  || npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Requirements before running either:

- Node 22+
- Chrome, Edge or Chromium installed (taste-skill inspect uses a real browser)
- `CHROME_PATH` set in env if not auto-detected (see `CLAUDE.md`)

---

## Surface map

| Surface | Pages | Library | Route |
| --- | --- | --- | --- |
| **Story** | `/` (landing), `/about` | mengto/skills | `build-awwwards-quality-sites` + `cinematic-gsap-lenis-motion-system` |
| **Work** | `/apps`, `/apps/{id}`, `/apps/new`, `/apps/{id}/edit`, `/cohorts`, `/cohorts/{id}`, `/u/{id}`, `/me`, `/admin` | taste-skill | App-screen route (`draw.mjs --app`, `inspect.mjs --app`) |

The work surface style was already dealt in `.taste-skill/app` (accent ladder). **Do not re-deal it.** Extend it if a new token is needed. If the story surface needs its own type or palette decisions, deal them separately in `.taste-skill/about` and **do not import them into work screens.**

---

## Story surface — execution sequence

Read the full skill before writing a single line of HTML or CSS.

```
agent-skills/web-design/build-awwwards-quality-sites/SKILL.md
agent-skills/web-design/cinematic-gsap-lenis-motion-system/SKILL.md
agent-skills/ui/no-ai-design-slop/SKILL.md
agent-skills/workflow/workflow-score-to-target/SKILL.md
```

Then follow these steps in order:

### Step 1 — Art direction (write before coding)

Produce a short written brief covering:

- **Visual thesis**: one sentence naming the concept. The required starting point is *gotong royong* expressed through the cohort ring (assignment lines drawing in as the visitor scrolls). The design process may replace this with a stronger idea — it must be specific to TesBareng, not a generic SaaS pattern.
- **Hero focal asset**: what is in the first viewport (the ring, a data visualisation, a typographic lock-up — not a gradient blob).
- **Type hierarchy**: display face for headings, text face for body, tabular numerals for counts. Both must render Indonesian text well and be subset.
- **Colour system**: background, foreground, accent (one, used for data as on work screens), and whether the landing is light or dark. The system must not conflict with the work surface's dealt tokens.
- **Section sequence**: what story the page tells, section by section. Derive it from the product's actual mechanics (join group → opt in → check in → feedback on Play → ready to apply) not from a default "features → testimonials → CTA" template.
- **Motion narrative**: what each animation explains: ring lines forming to show assignment, a progress bar filling toward 12/14, a tester row arriving.
- **Smooth-scroll engine**: choose Lenis or Locomotive, once, for the landing page. Never install both.
- **Three.js decision**: use only if the ring or another focal moment requires spatial depth or shader interaction that CSS + SVG cannot achieve cleanly. Justify it or skip it.
- **Asset sources**: all media credited and licensed. No stock-grade images, no generated faces, no invented testimonials or fake app logos.

### Step 2 — Build

Follow `build-awwwards-quality-sites` §2–§6.

Motion rules from `cinematic-gsap-lenis-motion-system`:

| Token | Value |
| --- | --- |
| Eases | `power3.out`, `power4.out`, `expo.out` |
| Scroll scrub | 0.8 – 1.4 |
| Reveal duration | 0.75 s – 1.1 s |
| Hover duration | 0.35 s – 0.6 s |
| Text stagger (words) | 0.035 s – 0.07 s |
| Text stagger (lines) | 0.08 s – 0.14 s |
| Reveal trigger | `top 82%` |

Do not add animation that does not explain state, causality, hierarchy, continuity or spatial change. The ring drawing assignments is the one allowed "signature moment." All other animation supports content; it does not decorate.

### Step 3 — Anti-slop pass

Run the `no-ai-design-slop` gates on every section before moving on.

Flag and fix immediately:

- Gradient blobs used decoratively.
- Soft glows on text or cards with no semantic role.
- Icon-heading-description tiles that could appear on any SaaS product.
- Testimonials or partner logos that are not honest (real community members, with permission).
- Copy that could be autocompleted from a landing-page template ("powerful", "seamless", "next-level").
- Any lorem ipsum, anywhere.

### Step 4 — Score to target

Use `workflow-score-to-target` to self-score the landing page against the Awwwards rubric before showing it.

| Criterion | Weight | Minimum to proceed |
| --- | --- | --- |
| Design | 40% | 8 / 10 |
| Usability | 30% | 8 / 10 |
| Creativity | 20% | 8 / 10 |
| Content | 10% | 8 / 10 |

Score each criterion independently with a 3–5 point rubric. If any criterion is below 8, fix the weakest one before moving on. Do not round up.

### Step 5 — Validate

From `build-awwwards-quality-sites` §7:

- Production build passes without errors.
- Keyboard navigation, visible focus, touch, JS-off static fallback, `prefers-reduced-motion`.
- Only one smooth-scroll engine installed and initialised.
- All GSAP and WebGL resources clean up on page leave.
- No placeholder content, copied identity, misleading claims, uncredited media, or inaccessible split text in source or rendered page.
- Run Lighthouse on the landing page (mobile): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- Core Web Vitals on a real mid-range Android over 4G: LCP \< 2.5 s, CLS \< 0.1, INP \< 200 ms.

---

## Work surface — execution sequence

The work surface style is already dealt. Do not restart it.

```
.taste-skill/SKILL.md          # read first
.taste-skill/app               # existing app style (accent ladder, tokens, spacing)
```

For each new work screen:

1. `draw.mjs --app` to implement using the dealt style.
2. `inspect.mjs --app` at mobile (375 px), tablet (768 px), desktop (1280 px).
3. Fix every FAIL. Treat new WARN as a defect unless explicitly justified.
4. Screenshot mobile and desktop and save alongside the screen's component file.

**Shared constraints from the work surface that also apply to the story surface:**

- Tabular numerals on every count, day number, and date.
- The `id-ID` date format; times in WIB.
- Email masking rendered client-side from the `masked_email` field — never the raw address.
- All empty, error and first-run states are written and designed, not defaulted.
- The obligation matrix and tester table have a sticky first column on mobile with horizontal scroll.

---

## Motion budget by surface

| Surface | Allowed | Not allowed |
| --- | --- | --- |
| Story | GSAP + Lenis or Locomotive, ScrollTrigger, optional Three.js shader for the ring, CSS transitions | Scroll hijacking; both Lenis and Locomotive; per-frame DOM writes |
| Work | CSS transitions 150–250 ms on `transform`/`opacity`; micro-interactions on check-in, join, feedback tick | GSAP, Lenis, Three.js, ScrollTrigger; any animation that delays content access |

Work screens never load the story surface's motion bundle.

---

## Performance budget

Measured on a mid-range Android (Moto G-class) over throttled 4G, not only in DevTools emulation:

| Metric | Target |
| --- | --- |
| LCP | \< 2.5 s |
| CLS | \< 0.1 |
| INP | \< 200 ms |
| Main JS bundle (work screens) | \< 150 KB gzip (target; report actual vs Firebase baseline of 274 KB) |
| Story surface JS (own chunk, landing only) | \< 120 KB gzip (GSAP + Lenis + optional Three.js) |

---

## Accessibility baseline (both surfaces)

WCAG 2.2 AA:

- Text contrast ratios: normal text ≥ 4.5:1, large text ≥ 3:1.
- Visible focus ring on every interactive element.
- Full keyboard path through all flows: sign in → join app → check in → mark feedback sent.
- Semantic heading hierarchy and landmark regions per page.
- All form fields labelled (not just placeholder text).
- The cohort ring and obligation matrix described for screen readers (ARIA roles and live regions where state changes).
- Staggered text: unsplit accessible name preserved; decorative split words hidden from assistive technology.

---

## Awwwards submission checklist

Complete before submitting. All items must be checked.

- [ ] Story surface scores ≥ 8/10 on every Awwwards criterion by at least three reviewers outside the project.
- [ ] All work screens pass `inspect.mjs --app` at mobile, tablet and desktop with 0 FAIL.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 on landing, app list, app detail and cohort detail.
- [ ] Core Web Vitals within budget on a real device.
- [ ] Reduced-motion and keyboard-only walkthroughs pass the full flow.
- [ ] Real content: active cohort, real apps (with permission), real member profiles, no placeholder copy.
- [ ] Open Graph image per route (landing, app, cohort).
- [ ] Favicon set, custom 404 page.
- [ ] No invented testimonials, fake partner logos, or uncredited media.
- [ ] Submission fee budgeted and ready.
- [ ] Project description in English, credits (design, development, community) prepared.
- [ ] Short video or GIF of the signature moment (ring drawing assignments) prepared for the submission form.

---

## Consequences

- The design pass happens **after** the Supabase migration, per PRD §16. The migration's "no UI changes" rule still holds.
- Story surface motion code ships in a separate chunk loaded only on `/` and `/about`. Work screens never pay for it.
- The `workflow-score-to-target` self-scoring step is mandatory before any external review. Do not show the site until the score is ≥ 8/10 on every criterion.
- If the cohort ring is replaced with a different signature moment, update §2 of this ADR to match.
- Awwwards submission costs a fee. Confirm the submission budget with the owner before the design pass starts.