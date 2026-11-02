# ADR-001 — TesBareng Design System: Neubrutalism

|  |  |
| --- | --- |
| **Status** | Accepted — revised |
| **Decider** | Community Admin |
| **Date** | 2 November 2026 |
| **Revision** | r2 (2 Nov 2026): visual direction changed to **neubrutalism** for both surfaces. Replaces the cinematic / smooth-scroll direction of r1. |
| **Goal** | Awwwards Honorable Mention minimum; Site of the Day as target |
| **PRD ref** | PRD v2.2 §13 (rubric, requirements DR-1 to DR-19, acceptance). Where this ADR and PRD §13 differ on visual style or motion, **this ADR wins**. |

---

## Context

TesBareng has two surfaces:

- **Story surface**: landing (`/`) and About (`/about`). Jurors open it first. It must earn Design (40%) and Creativity (20%).
- **Work surface**: app list, app detail, tester table, cohort list and matrix, member profile, Tugas saya, forms, admin. It must earn Usability (30%), because jurors click through.

**Why neubrutalism.** TesBareng is a community tool about honesty and visible effort: who tested what, for how long, with what result. Neubrutalism says that visually. Raw structure, thick outlines, hard shadows and flat colour make every status, count and obligation impossible to miss. It also suits a product whose core object is a shared spreadsheet and an attendance matrix. Unlike the r1 cinematic direction, one system can serve both surfaces: the story surface is the same language turned up, not a different language.

**The risk.** Neubrutalism is a well-known trend with a recognisable template look. A generic version scores low on Creativity and reads as AI slop. Everything in this ADR is aimed at a version that could only be TesBareng: the cohort ring as the signature moment, an Indonesian palette with a story, real community content, and strict rules on where the loud elements go.

---

## Decision

### 0. Install the skill libraries first

> **If any library below is missing, install it before doing any design or UI work. Do not skip ahead.**

**mengto/skills** (story surface, anti-slop, scoring, illustrations):

```bash
ls agent-skills/web-design/build-awwwards-quality-sites/SKILL.md 2>/dev/null \
  && echo "mengto/skills present" \
  || (git clone --depth 1 https://github.com/mengto/skills.git /tmp/mengto-skills \
      && cp -r /tmp/mengto-skills/agent-skills ./agent-skills \
      && echo "mengto/skills installed")
```

**taste-skill** (work surface route and inspector):

```bash
ls .taste-skill/SKILL.md 2>/dev/null \
  && echo "taste-skill present" \
  || npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Requirements: Node 22+; Chrome, Edge or Chromium installed; `CHROME_PATH` set if not auto-detected (see `CLAUDE.md`).

### 1. Skills to read, per surface

| Surface | Read before building |
| --- | --- |
| Both (always) | `agent-skills/ui/no-ai-design-slop/SKILL.md`, this ADR §2–§4 |
| Story | `agent-skills/web-design/build-awwwards-quality-sites/SKILL.md`, `agent-skills/web-design/documentary-brutalist-agency/SKILL.md` (structure, grid, hard rules, motion defaults), `agent-skills/web-design/gsap-scrolltrigger-storytelling/SKILL.md` (ring scrub only), `agent-skills/workflow/workflow-score-to-target/SKILL.md` |
| Work | `.taste-skill/SKILL.md` (app-screen route), `agent-skills/web-design/animation-systems/SKILL.md` (micro-interactions) |
| Illustrations (empty states, 404, onboarding) | `agent-skills/illustration/illustration-bold-pop/SKILL.md` |
| Icons | `agent-skills/web-design/solar-duotone-bold/SKILL.md` (use Solar via Iconify; see §2.6) |

**No longer used (r1):** `cinematic-gsap-lenis-motion-system`. Lenis or Locomotive smooth scrolling does not belong in this direction.

**Conflicts between skills, resolved here:**

- `build-awwwards-quality-sites` says not to draw illustrations as model-authored SVG. For **spot illustrations only** (empty states, 404, onboarding, error pages), this ADR overrides that line: use `illustration-bold-pop`, which is a hand-authored SVG style with its own render-and-critique loop, recoloured to the tokens in §2. Hero and story imagery still follow `build-awwwards-quality-sites`.
- `build-awwwards-quality-sites` asks for one smooth-scroll engine. This ADR chooses **none**: native scrolling only.
- `illustration-bold-pop` uses a navy ink and its own palette. Replace them with `--ink` and the palette below.

### 2. The neubrutalist system (shared by both surfaces)

The work surface style dealt in `.taste-skill/app` under r1 (accent ladder) is **re-dealt once** to this system. Story and work share one token file; the story surface uses larger sizes and offsets, never different colours or fonts.

#### 2.1 Colour: the "bumbu" palette

Flat colours named after Indonesian spices and plants, so the palette has a story and the token names are memorable. Each colour has **one job**; colour is spent on meaning (PRD DR-3).

| Token | Hex (starting point) | Job |
| --- | --- | --- |
| `--ink` | `#121212` | All text, every border, every hard shadow |
| `--kertas` (paper) | `#FFF6E3` | Page background |
| `--putih` | `#FFFFFF` | Card and table surfaces |
| `--kunyit` (turmeric) | `#FFC83D` | Primary action, focus highlight, the active day on the cohort schedule |
| `--pandan` | `#2FD47E` | Eligible, verified, done, Good standing |
| `--langit` (sky) | `#6BB8FF` | Opted in, informational, links on hover |
| `--cabai` (chilli) | `#FF5B4F` | "Belum tes", behind, errors, destructive actions, Owing |
| `--ubi` (purple yam) | `#B9A3FF` | Badges and reciprocity only |

Badge tiers (PRD FR-27h): Bronze `#D9894A`, Silver `#C7CDD6`, Gold uses `--kunyit`, Platinum uses `--ubi`. Each badge also carries its name in text; colour is never the only signal.

Rules:

- Text on any colour fill is `--ink`. Never white text on a saturated fill. (Ink on every fill above meets WCAG AA; verify each final hex with a contrast checker after tuning.)
- No gradients, no glows, no transparency effects, no blur.
- A screen uses at most two fill colours besides paper and white, unless it is showing data (the matrix may use all status colours).
- Dark mode: out of scope for MVP. Neubrutalism is designed light-first; a later dark theme swaps `--kertas` for near-black and borders for paper, keeping the same fills.

#### 2.2 Borders and shadows

| Token | Work surface | Story surface |
| --- | --- | --- |
| Border width | 2 px | 3 px (2 px under 480 px wide) |
| Hard shadow (resting) | `3px 3px 0 0 var(--ink)` | `6px 6px 0 0 var(--ink)` |
| Hard shadow (hover) | `5px 5px 0 0` with `translate(-2px,-2px)` | `9px 9px 0 0` with `translate(-3px,-3px)` |
| Pressed | `translate(3px,3px)`, shadow `0 0` | `translate(6px,6px)`, shadow `0 0` |
| Radius | 0 on structure (tables, matrix, panels, inputs); 6 px on buttons and cards; 999 px only for badges and avatars | Same |

Shadows always fall **down-right** and are always solid `--ink`. No blur, ever.

**Shadows mean "you can touch this or it sits above".** Buttons, cards that link, modals, toasts, the active tab and the ring nodes get shadows. Table rows, matrix cells, static text blocks and form fields at rest do not. This is the main defence against the template look (see §2.7).

#### 2.3 Typography

- **Text face:** Plus Jakarta Sans, designed by the Indonesian foundry Tokotype and named after Jakarta. It reads well in Bahasa Indonesia and gives the content a local story.
- **Display face:** one heavy, wide grotesk for headlines and billboard lines (candidates: Archivo at Black or Expanded width; choose in Step 1). It must render Indonesian well and be subset.
- **Numbers:** every count, day, date and score uses tabular figures. If the text face's tabular figures are weak at small sizes, use one monospace (e.g. JetBrains Mono or IBM Plex Mono) for data cells and counters only.
- **Do not default to Space Grotesk.** It is the most common neubrutalist choice and reads as template.
- Headlines in sentence case; uppercase only for short labels (status chips, table headers) with letter-spacing +4%.

| Role | Work surface | Story surface |
| --- | --- | --- |
| Display | 28–36 px | 56–128 px (`clamp`) |
| Heading | 20–24 px | 32–48 px |
| Body | 15–16 px | 18–20 px |
| Data / label | 13–14 px, tabular | 14–16 px, tabular |

#### 2.4 Grid and layout

- An **exposed grid**: 2 px ink rules divide sections and columns instead of whitespace-only separation (from `documentary-brutalist-agency`).
- 12-column grid on desktop, 4 on mobile, 8 px spacing base (8, 16, 24, 32, 48, 64, 96).
- The tester table and obligation matrix look like a real sheet: ruled rows, a sticky first column on mobile, ink header row on `--kunyit` or `--putih`.
- Asymmetry is allowed on the story surface (a block that overhangs a rule, an oversized number). It is never random: no rotated "sticker" elements unless they carry information.

#### 2.5 Components (work surface)

- **Buttons:** primary = `--kunyit` fill, 2 px ink border, hard shadow, press-down effect. Secondary = `--putih`. Destructive = `--cabai`. Labels are verbs in Bahasa Indonesia ("Gabung sebagai tester", "Tandai sudah kirim").
- **Status chips:** square-cornered, ink border, status fill, uppercase label, plus a glyph (✓, ✓✓, !, —) so status never depends on colour alone.
- **Progress bars (12/14):** a ruled track with 12 or 14 segments; filled segments in the status colour. Counting cells reads better in neubrutalism than a smooth bar and matches "12 testers, 14 days".
- **Matrix cells:** flat status fill with glyph, no shadow; the current user's row has a `--kunyit` left edge.
- **Inputs:** 2 px ink border, no shadow at rest, `--kunyit` 3 px outline on focus.
- **Badges:** pill, ink border, tier fill, tier name in text.

#### 2.6 Icons and illustrations

- Icons: Solar via Iconify (as `solar-duotone-bold` recommends), drawn in `--ink`, at 20 or 24 px. Do not mix icon families.
- Spot illustrations: `illustration-bold-pop` recoloured to the bumbu palette and `--ink` outlines, used only where a state needs warmth: empty tester list, empty Tugas saya, 404, offline, first-run. Never as decoration on content-heavy screens.
- Avatars: the member's Google photo inside an ink-bordered circle. No generated faces.

#### 2.7 Neubrutalist slop: never do these

- A hard shadow on every element.
- Random tilts, sticker spam, starbursts with no meaning.
- Rainbow cards where colour encodes nothing.
- Marquee tickers, cursor-follower blobs, emoji as icons.
- Space Grotesk plus a yellow button plus a pink card as the entire identity.
- Fake testimonials, invented app logos, made-up numbers.
- Thick borders on everything at the same weight, so nothing has hierarchy.

### 3. Motion: snap, not glide

Neubrutalist motion is quick, physical and honest: things press, stamp and slide into place. It never floats.

| Token | Value |
| --- | --- |
| Press / release | 80–100 ms, `ease-out` |
| Hover (shadow grow) | 120–160 ms, `ease-out` |
| Control transitions (tabs, chips, toggles) | 160–220 ms |
| Entrances (sections, modals, toasts) | 300–450 ms, `power2.out`, or `steps(3)`–`steps(5)` for a stamp feel |
| Stagger | 40–60 ms between items, max 8 items animated per group |
| Scroll scrub (ring only) | `scrub: 0.4`–`0.6` (snappier than r1's 0.8–1.4) |

- **Native scrolling only.** No Lenis, no Locomotive, no scroll hijacking.
- Animate only `transform` and `opacity` (the shadow change is done by animating the element's `translate` and swapping a static shadow, or by a pseudo-element, never by animating `box-shadow` blur).
- No bounce, elastic or spring overshoot. Movement stops dead, like a stamp.
- `prefers-reduced-motion`: render final states immediately; press effects become an instant colour/shadow swap.

| Surface | Allowed | Not allowed |
| --- | --- | --- |
| Story | GSAP + ScrollTrigger for the cohort ring only; CSS for everything else | Smooth-scroll libraries; pinned sequences longer than one viewport of scroll; Three.js unless the ring genuinely needs depth (default: SVG) |
| Work | CSS transitions per the table above; press effects; a stamp animation when a check-in or "feedback sent" is recorded | GSAP, ScrollTrigger, Three.js, anything that delays access to content |

Work screens never load the story surface's motion bundle.

### 4. The signature moment: the cohort ring, neubrutalist

- Members appear as **chunky ink-outlined nodes** with hard shadows around a ring (photos or initials inside, `--putih` fill; creators and pure testers distinguished by shape: square nodes bring an app, round nodes are pure testers).
- As the visitor scrolls, **3 px ink lines draw in** from each node to the apps it is assigned to. Each node **stamps** (`steps`) to `--pandan` when its 14 lines are complete.
- The final frame states the rule in one billboard line, e.g. "15 orang. 14 tester untuk setiap app. Semua ikut tes." (final copy decided in Step 1).
- **Static fallback** (no JS, reduced motion, or slow device): the completed ring as a single SVG with the same line, fully readable.
- Built in SVG by default. Three.js only if Step 1 justifies it (PRD DR-17 budget applies).
- Screen readers get a text description: how many members, how many apps, and the rule.

---

## Story surface: execution sequence

### Step 1: Art direction brief (write before coding)

Within the system in §2, write:

- Visual thesis in one sentence (starting point: *gotong royong* made visible: everyone's effort, outlined and counted).
- Hero composition: the ring, the billboard line, the primary CTA ("Gabung komunitas").
- Display face chosen, with the reason.
- Section sequence derived from the product's real mechanics: the problem (12 testers, 14 days) → the ring → how a cohort runs (Day 0, 2, 7, 13) → pure testers and badges → real numbers from finished cohorts → join (Google Group + WhatsApp).
- Motion narrative: what each animation explains.
- Asset sources: real community apps (with permission), member photos (with permission), illustrations from `illustration-bold-pop`.

### Step 2: Build

Follow `build-awwwards-quality-sites` §2–§6 and `documentary-brutalist-agency` (structure, grid, FAQ, footer), within §2 and §3 of this ADR.

### Step 3: Anti-slop pass

Run `no-ai-design-slop` gates on every section, plus §2.7 of this ADR. Remove the highest-impact problem first.

### Step 4: Score to target

Use `workflow-score-to-target` against the Awwwards rubric:

| Criterion | Weight | Minimum to proceed |
| --- | --- | --- |
| Design | 40% | 8 / 10 |
| Usability | 30% | 8 / 10 |
| Creativity | 20% | 8 / 10 |
| Content | 10% | 8 / 10 |

Add one neubrutalism-specific check to Creativity: "Could this page be mistaken for a generic neubrutalist template?" If yes, Creativity cannot score above 6. Judge from rendered screenshots with a fresh subagent; never round up.

### Step 5: Validate

- Production build passes.
- Keyboard, visible focus, touch, JS-off fallback, reduced motion.
- No smooth-scroll library installed; all GSAP resources clean up on leave.
- No placeholders, copied identity, unsupported claims, uncredited media, or inaccessible split text.
- Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- Core Web Vitals on a real mid-range Android over 4G: LCP \< 2.5 s, CLS \< 0.1, INP \< 200 ms.

---

## Work surface: execution sequence

1. **Re-deal once:** update `.taste-skill/app` to the §2 tokens (colours, borders, shadows, radius, type, spacing). Record the deal so it is never repeated.
2. For each screen: `draw.mjs --app` using the re-dealt style.
3. `inspect.mjs --app` at 375 px, 768 px and 1280 px. Fix every FAIL; treat new WARN as a defect unless justified in a comment.
4. Check §2.2's shadow rule on every screen: only touchable or elevated elements carry shadows.
5. Screenshot mobile and desktop and save them next to the screen's component.

Shared rules: tabular numbers everywhere; `id-ID` dates and WIB times; only `masked_email` is ever rendered; every empty, error and first-run state written and designed (illustrations per §2.6); sticky first column on the tester table and matrix on mobile.

---

## Performance budget

Measured on a mid-range Android (Moto G class) over throttled 4G, plus DevTools:

| Metric | Target |
| --- | --- |
| LCP | \< 2.5 s |
| CLS | \< 0.1 |
| INP | \< 200 ms |
| Main JS, work screens | \< 150 KB gzip (report actual vs the 274 KB Firebase baseline) |
| Story surface JS (own chunk, landing only) | \< 80 KB gzip (GSAP core + ScrollTrigger; lower than r1 because there is no smooth-scroll library and the ring is SVG) |
| Fonts | ≤ 3 files, subset, preloaded, `font-display: swap`, metric-matched fallback |

---

## Accessibility baseline (both surfaces)

WCAG 2.2 AA:

- Ink text on every palette fill verified at ≥ 4.5:1 (normal text) and ≥ 3:1 (large text) after final hex tuning.
- Focus: 3 px `--kunyit` outline plus the ink border, visible on every surface colour (on `--kunyit` fills, use a 3 px ink outline offset 2 px instead).
- Status never by colour alone: glyph plus text on chips, matrix cells and badges.
- Full keyboard path: sign in → join app → check in → mark feedback sent → join a cohort as pure tester.
- Semantic headings and landmarks; labelled fields; ring and matrix described for screen readers; live region announces check-in and join results.
- Touch targets ≥ 44 px; press effects never move a target out from under the finger (translate ≤ 6 px).

---

## Awwwards submission checklist

- [ ] Story surface scores ≥ 8/10 on every criterion from at least three reviewers outside the project, and none of them calls it "a neubrutalism template".
- [ ] All work screens pass `inspect.mjs --app` at mobile, tablet and desktop with 0 FAIL.
- [ ] Lighthouse mobile targets met on landing, app list, app detail, cohort detail and a member profile.
- [ ] Core Web Vitals within budget on a real device.
- [ ] Reduced-motion and keyboard-only walkthroughs pass the full flow.
- [ ] Real content: an active cohort, real apps and member profiles with permission, no placeholder copy.
- [ ] Open Graph images per route (landing, app, cohort, profile) in the neubrutalist style.
- [ ] Favicon set and a designed 404 page (bold-pop illustration).
- [ ] No invented testimonials, fake logos or uncredited media.
- [ ] Submission fee budgeted.
- [ ] English project description and credits (design, development, community) ready.
- [ ] Short video or GIF of the ring drawing assignments and stamping complete.

---

## Consequences

- Both surfaces share one token file. A change to the palette or borders changes the whole product, so token changes need the owner's approval.
- The r1 work-surface deal is replaced once; afterwards the "do not re-deal" rule applies again.
- No smooth-scroll dependency, and an SVG ring, make the story chunk smaller than in r1.
- PRD v2.2 §13 still describes a more cinematic direction in places (longer choreography, smooth scrolling). For visual style and motion, this ADR takes precedence until §13 is aligned.
- The design pass still happens after the Supabase migration (PRD §16); the migration's "no UI changes" rule holds.
- If the cohort ring is replaced as the signature moment, update §4.