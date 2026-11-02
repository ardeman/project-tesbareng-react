---
name: design-tokens
description: This project's actual design tokens — colors, typography, spacing, radius, elevation, and component-level values. Read alongside human-centered-design.md and design-qa-review.md, which define the judgment; this file defines the exact numbers for this specific client.
---

# DESIGN.md — TesBareng

> **Status: APPROVED by the owner, 2 Nov 2026**, including every **[proposed]** value below. Modal scrim: the one allowed transparency, `#121212` at 40%. Code tokens live in `web/src/tokens.css`.
>
> Source: ADR-001 r2 §2–§4 (neubrutalism, "bumbu" palette). ADR-001 wins over this file's template defaults and over the CRM-oriented agents wherever they disagree (e.g. the template's 2-family / 10 px radius / soft shadow defaults do not apply). Values marked **[proposed]** are not in ADR-001 and are the draft author's suggestion; everything else is copied from ADR-001.
>
> One token file for both surfaces. The story surface (landing, `/about`) uses larger sizes and offsets, never different colours or fonts. Token changes need the owner's approval.

## Direction

- **Personality:** Honest & loud, structured like a shared spreadsheet. *Gotong royong* made visible: everyone's effort, outlined and counted.
- **Color temperature:** Warm (paper cream, turmeric), flat fills named after Indonesian spices and plants.
- **Depth strategy:** hard ink shadows only on touchable or elevated elements (buttons, linking cards, modals, toasts, active tab, ring nodes); ink borders for static separation. No blur, ever.

## Colors

Every fill has **one job** (PRD DR-3). Text on any fill is `{colors.ink}`; never white text on a saturated fill. No gradients, glows, transparency or blur. Max two fill colours per screen besides paper and white, unless the screen shows data (the matrix may use all status colours). Dark mode: out of scope for MVP (ADR-001 §2.1).

Contrast of ink `#121212` text on each fill (computed 2 Nov 2026): kertas 17.4, putih 18.7, kunyit 12.1, pandan 9.7, langit 8.9, ubi 8.7, silver 11.7, bronze 6.8, cabai 6.1 — all ≥ 4.5:1 (AA normal text).

### Brand & accent

| Token | Hex (light) | Hex (dark) | Use |
|---|---|---|---|
| `{colors.primary}` = `--kunyit` (turmeric) | `#FFC83D` | — | Primary action fill, the active day on the cohort schedule, focus highlight (see focus rule) |
| `{colors.primary-active}` | `#FFC83D` | — | Same fill; pressed state is shown by movement (translate + shadow 0), not a colour change |
| `{colors.primary-disabled}` **[proposed]** | `#F2E6C8` | — | Disabled primary fill, with ink text at 4.5:1+ and no shadow |
| `{colors.accent}` = `--ubi` (purple yam) | `#B9A3FF` | — | Badges and reciprocity **only** |

### Surface

| Token | Hex (light) | Hex (dark) | Use |
|---|---|---|---|
| `{colors.canvas}` = `--kertas` (paper) | `#FFF6E3` | — | Page background |
| `{colors.surface-soft}` **[proposed]** | `#F7EBCF` | — | Disabled fields, row hover, greyed-out unassigned matrix cells |
| `{colors.surface-strong}` = `--putih` | `#FFFFFF` | — | Card and table surfaces |

### Border & hairline

| Token | Hex (light) | Hex (dark) | Use |
|---|---|---|---|
| `{colors.hairline}` = `--ink` | `#121212` | — | Table row rules (1 px **[proposed]** inside tables so rows don't all weigh the same as section rules) |
| `{colors.border-strong}` = `--ink` | `#121212` | — | 2 px (work) / 3 px (story) borders, exposed-grid section rules, input outlines |

### Text

| Token | Hex (light) | Hex (dark) | Use |
|---|---|---|---|
| `{colors.ink}` = `--ink` | `#121212` | — | All text, every border, every hard shadow |
| `{colors.body}` | `#121212` | — | Running text (same as ink) |
| `{colors.muted}` **[proposed]** | `#57534B` | — | Metadata, timestamps. 7.1:1 on kertas, 7.7:1 on putih, 4.95:1 on kunyit |
| `{colors.on-primary}` | `#121212` | — | Text on every fill |

### Semantic (status; one job each)

| Token | Hex (light) | Hex (dark) | Use |
|---|---|---|---|
| `{colors.success}` = `--pandan` | `#2FD47E` | — | Eligible, verified, done, Good standing |
| `{colors.info}` = `--langit` (sky) | `#6BB8FF` | — | Opted in, informational, link hover |
| `{colors.danger}` = `--cabai` (chilli) | `#FF5B4F` | — | "Belum tes", Behind, errors, destructive actions, Owing |
| `{colors.warning}` | — | — | **Not defined in ADR-001.** Proposal: no separate warning colour; "needs attention" uses a `--putih` chip with an ink `!` glyph. Owner to confirm. |

### Badge tiers (PRD FR-27h; always with the tier name in text)

| Tier | Fill |
|---|---|
| Bronze | `#D9894A` |
| Silver | `#C7CDD6` |
| Gold | `--kunyit` `#FFC83D` |
| Platinum | `--ubi` `#B9A3FF` |

## Typography

**Font family:** text/UI: **Plus Jakarta Sans** (Tokotype, Jakarta). Display: **Archivo** at Black, Expanded width **[proposed; ADR-001 lists it as a candidate, final choice is in story Step 1]**. Data: Plus Jakarta Sans tabular figures (`font-variant-numeric: tabular-nums`); if they are weak at 13 px, **JetBrains Mono** for data cells and counters only **[proposed]**. Three families maximum (ADR-001 overrides the template's 2-family default). **Never Space Grotesk.**
**Fallback stack:** metric-matched fallback via `size-adjust`, then `-apple-system, system-ui, sans-serif`.
**Loading:** ≤ 3 font files, subset (Latin + Indonesian), preloaded, `font-display: swap`.

Headlines in sentence case. Uppercase only for short labels (status chips, table headers) with letter-spacing +4%.

| Token | Work surface | Story surface | Weight | Line height | Use |
|---|---|---|---|---|---|
| `{typography.display}` | 32px (28–36) | `clamp(56px, 10vw, 128px)` | Archivo 900 | 1.0 | Page titles, billboard lines |
| `{typography.h1}` | 24px | 40px (32–48) | Jakarta 800 | 1.2 | Section headers |
| `{typography.h2}` | 20px | 32px | Jakarta 700 | 1.25 | Card/panel titles |
| `{typography.body}` | 16px (15–16) | 19px (18–20) | Jakarta 500 | 1.5 | Paragraphs, form values |
| `{typography.small}` | 14px | 16px | Jakarta 500, tabular | 1.4 | Table cells, data |
| `{typography.caption}` | 13px | 14px | Jakarta 700, uppercase +4% | 1.3 | Chip labels, table headers |
| `{typography.button}` | 15px | 18px | Jakarta 700 | 1 | Button labels (verbs in Bahasa Indonesia) |

Weights in use: 500, 700, 800 (Jakarta) + 900 (Archivo display only).

## Radius

| Token | Value | Use |
|---|---|---|
| `{radius.none}` | 0px | Structure: tables, matrix, panels, inputs, status chips |
| `{radius.sm}` | 6px | Buttons, linking cards |
| `{radius.md}` | 6px | Modals, toasts (same as sm; neubrutalism keeps one corner) |
| `{radius.lg}` | 6px | Not used separately |
| `{radius.full}` | 9999px | Badges and avatars only |

## Spacing

**Base unit:** 8px. Scale: 8, 16, 24, 32, 48, 64, 96 (ADR-001 §2.4). Half steps 4px only inside chips and dense table cells **[proposed]**.

| Token | Value |
|---|---|
| `{spacing.xxs}` | 2px (border only) |
| `{spacing.xs}` | 4px |
| `{spacing.sm}` | 8px |
| `{spacing.md}` | 16px |
| `{spacing.base}` | 16px |
| `{spacing.lg}` | 24px |
| `{spacing.xl}` | 32px |
| `{spacing.section}` | 48px (work) / 64–96px (story) |

Grid: 12 columns desktop, 4 mobile, exposed 2 px ink rules between sections and columns.

## Elevation

Depth strategy: hard shadows **only** on touchable or elevated elements. Table rows, matrix cells, static text and form fields at rest never get one.

| Token | Work surface | Story surface | Use |
|---|---|---|---|
| `{shadow.none}` | none | none | Most of the UI |
| `{shadow.card}` (resting) | `3px 3px 0 0 #121212` | `6px 6px 0 0 #121212` | Buttons, linking cards, active tab, ring nodes |
| `{shadow.hover}` | `5px 5px 0 0` + `translate(-2px,-2px)` | `9px 9px 0 0` + `translate(-3px,-3px)` | Hover on the above |
| `{shadow.pressed}` | `translate(3px,3px)`, shadow 0 | `translate(6px,6px)`, shadow 0 | Press |
| `{shadow.modal}` | `6px 6px 0 0 #121212` **[proposed]** | same | Modals, toasts |

**Modal scrim:** ADR-001 forbids transparency effects. `#121212` at 40% (approved exception to the no-transparency rule, modal backdrop only).

Shadows always fall down-right, always solid ink. Animate `transform` only (swap static shadows), never `box-shadow`.

## Motion

| Token | Value |
|---|---|
| Press / release | 80–100 ms `ease-out` |
| Hover (shadow grow) | 120–160 ms `ease-out` |
| Control transitions | 160–220 ms |
| Entrances | 300–450 ms `power2.out`, or `steps(3)`–`steps(5)` for a stamp feel |
| Stagger | 40–60 ms, max 8 items per group |
| Ring scroll scrub (story only) | `scrub: 0.4`–`0.6` |

Native scrolling only; no Lenis/Locomotive. No bounce, elastic or spring overshoot. `prefers-reduced-motion`: final states immediately. Work screens: CSS only (no GSAP). Story: GSAP + ScrollTrigger for the ring only, in its own chunk.

## Components

| Component | Background | Text | Typography | Radius | Padding | Notes |
|---|---|---|---|---|---|---|
| `button-primary` | kunyit | ink | button | 6px | 12px 20px, min-height 44px | 2 px ink border, `shadow.card`, press-down |
| `button-secondary` | putih | ink | button | 6px | same | same |
| `button-destructive` | cabai | ink | button | 6px | same | same |
| `status-chip` | status fill | ink | caption | 0 | 2px 8px | 2 px ink border, glyph (✓ ✓✓ ! —) + uppercase text; no shadow |
| `badge` | tier fill | ink | caption | 9999px | 2px 10px | 2 px ink border, tier name in text |
| `progress-12/14` | putih track | — | small | 0 | — | 12 or 14 ruled segments, filled in status colour, label "X / 12" tabular |
| `table-row` | putih | ink | small | 0 | 12px 16px | Height 44–48px, 1 px ink rule, ink header row on kunyit or putih, sticky first column on mobile |
| `matrix-cell` | status fill / surface-soft (unassigned) | ink | small | 0 | — | Glyph + text, no shadow; current user's row has a kunyit left edge |
| `input` | putih | ink | body | 0 | 10px 12px, min-height 44px | 2 px ink border, no shadow at rest |
| `avatar` | — | — | — | 9999px | — | Google photo in 2 px ink-bordered circle; no generated faces |

**Focus (all elements) [proposed fix to ADR-001]:** ADR-001 says "3 px kunyit outline plus the ink border". Kunyit against paper/white is only **1.44–1.55:1**, which fails WCAG 1.4.11 (3:1) on its own. Proposal: **3 px ink outline, offset 2 px**, with a kunyit fill/underlay where it helps visibility; on kunyit fills the same ink outline (ADR-001 already says this). Owner to confirm.

**Icons:** Solar (Iconify) in ink at 20 / 24 px; one family only. **Illustrations:** bold-pop style recoloured to the palette, only on empty / 404 / offline / first-run states.

## Roles & default views

| Role | Default landing view | Hidden/restricted fields |
|---|---|---|
| Visitor | `/` (app list today; story page if ADR-008 option A is accepted) | WhatsApp links; all write actions prompt login |
| Member | Same, after login return to where they came from | WhatsApp link of cohorts they're not in |
| Cohort member | `/me` (Tugas saya) is the work home | — |
| Admin | `/admin` | — |

Emails are only ever shown masked, to everyone; profiles show none.

## Responsive behavior

| Breakpoint | Width | Key changes |
|---|---|---|
| Mobile | < 640px | Primary target. 4-column grid, story borders drop to 2 px under 480 px, tester table and matrix scroll horizontally with a sticky first column, touch targets ≥ 44 px |
| Tablet | 640–1024px | 8-column grid **[proposed]** |
| Desktop | > 1024px | 12-column grid |

**Confirmed scope:** full responsive, mobile-first (PRD §12). Screens are checked at 375, 768 and 1280 px.

## Do's and don'ts

- Do: spend colour only on meaning (progress, tester status, feedback state, obligations, badges).
- Do: pair every status colour with a glyph and text.
- Do: use tabular numerals for every count, day and date; `id-ID` dates, WIB times.
- Don't: hard shadows on everything, random tilts, sticker spam, starbursts, marquees, cursor blobs, emoji as icons.
- Don't: rainbow cards, fake testimonials, invented logos or numbers, Space Grotesk + yellow button + pink card as the identity.
- Don't: thick borders on everything at the same weight; keep hierarchy (2 px structure, 1 px table rules).

## Known gaps

- [ ] Display face final choice (Archivo Black/Expanded proposed; ADR-001 story Step 1).
- [ ] Data face: Jakarta tabular vs JetBrains Mono (decide after a 13 px render test).
- [ ] Warning colour (proposed: none).
- [ ] Focus ring (proposed: ink outline, because kunyit fails 3:1).
- [ ] Modal scrim vs "no transparency" rule.
- [ ] `muted`, `surface-soft`, `primary-disabled` hexes (proposed above).
- [ ] Dark mode: out of scope for MVP.
- [ ] Logo / favicon set: not delivered.

## Quick reference for generation prompts

TesBareng is neubrutalist and warm: paper `#FFF6E3` background, white `#FFFFFF` cards and tables, ink `#121212` for all text, 2 px borders and hard down-right shadows (`3px 3px 0 #121212`, only on things you can touch or that float). One job per colour: turmeric `#FFC83D` primary action, pandan `#2FD47E` done/eligible/verified, sky `#6BB8FF` opted-in/info, chilli `#FF5B4F` behind/error/Belum tes/Owing, purple yam `#B9A3FF` badges only. Text is Plus Jakarta Sans, the display face is Archivo Black, with tabular numerals everywhere. Corners are 0 on structure, 6 px on buttons and cards, and pills only for badges and avatars. Motion is snappy and stamp-like: transform and opacity only, no bounce, native scroll. No gradients, glows, blur or white text on colour, and status is never shown by colour alone.
