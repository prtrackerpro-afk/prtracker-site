# Design Review: PR Tracker Admin
**Date**: 2026-04-29
**URL**: https://www.prtracker.com.br/admin (mobile 390×844, tablet 768×1024, desktop 1440×900)
**Reviewer**: Claude Code (jezweb/claude-skills `design-review` skill, run inline)

## Overall Impression
A polished brand surface (navy+lime tokens applied, cards are tidy, sidebar nav reads well on desktop) is being **undermined by a single CSS bug that hides every page heading**, plus a mobile grid that overflows the viewport. Once those two are fixed the dashboard goes from "broken" to "professional".

## Findings

### High
- **Headings invisible across all admin pages** — `src/styles/global.css:155-162` sets `h1, h2, h3, h4, h5, h6 { color: var(--color-brand-navy); }`, and the admin layout is `bg-navy-900` (also `#01002a`). Every page title (`OVERVIEW`, `META ADS`, `ALERTAS`) and every section title (`SPEND × REVENUE DIÁRIO`, `ALERTAS ABERTOS`, `INGESTÃO RECENTE`, `CAMPANHAS → ADSETS → ADS`) renders navy-on-navy and disappears. Subtitles below them are visible because they use `text-navy-300`. → Override heading color in admin scope (white) without touching the global brand rule.
- **KPI grid overflows mobile viewport** — On 390px the `grid-cols-2` cards plus `text-3xl font-semibold` for numbers like `R$ 246,06` push the second column off-screen. Both Overview and Meta pages cut the right column at ~50% past the viewport. → Switch to `grid-cols-1 xs:grid-cols-2 lg:grid-cols-4` and downscale the number to `text-2xl md:text-3xl`. Add `min-w-0` on cards so children can shrink.
- **Meta Ads table is unusable on mobile** — 9 columns × 390px viewport leaves only `Nome` and `Status` visible in the screenshot region. `overflow-x-auto` is set on the wrapper but with no visual affordance the user assumes the metrics weren't loaded. → Add a right-edge fade gradient to signal scroll AND change the breakpoint behavior to stack to compact cards below `md:` (or stick the first column).

### Medium
- **Date range pills overflow on mobile** — `Hoje 7d 14d 30d 90d` exits the right edge on Overview/Meta. → Wrap in `flex-wrap` or make the row horizontally scrollable with snap points.
- **Mobile sidebar tap target small** — `☰` summary at top-right is bare-text size (~14px). Acceptable but borderline for the 44×44 guideline. → Pad to a circular button (`p-2` minimum) and add visible border or background when closed.
- **Chart container empty on initial render** — `client:only="react"` chart shows blank section on first paint until hydrated. `Conta Meta — últimos 7 dias` subtitle floats alone in the card for ~300ms. → Add a low-key skeleton (animated pulse or static placeholder line) so the section reads as "loading", not "empty".

### Low
- **KPI cards have generous vertical padding for the data density** — `p-5` (20px) on mobile makes 8 stacked cards take ~1100px of scroll. Could be `p-4` on mobile.
- **Status badges in Meta table use 3 different background opacities** — `bg-emerald-500/15`, `bg-amber-500/15`, `bg-red-500/15`. Consistent enough, but the `bg-navy-700` paused badge has no background tint and reads as different system. Minor consistency nit.
- **`Logado como` block in sidebar uses 4 different text sizes within ~80px** — works but a lot of typographic noise. Could collapse to a compact dropdown.

## What Looks Good
- **Brand token discipline** — Navy/lime/grays all driven by CSS variables. No raw `bg-blue-500`-style colors anywhere in admin.
- **Sidebar nav active state** — Lime pill on dark sidebar reads instantly, looks deliberate.
- **Card system** — Border-radius, border color, and background tint are consistent across KPI cards, alert cards, and sections.
- **Server-rendered data tables** — No layout shift; everything fixed-position from first paint (once headings are visible).
- **Typography stack** — Big Shoulders for display + Outfit for body is in place, brand-correct, and self-hosted (no FOUT after first load).
- **Severity color usage in alerts** — `critical=red / warning=amber / info=blue` is the standard semantic mapping, used consistently.

## Top 3 Fixes
1. **Restore heading visibility on admin** — One-line CSS override scoped to admin pages so brand tokens stay untouched on the public site. Highest visual impact: every page suddenly has a title.
2. **Fix mobile KPI grid overflow + sizing** — `grid-cols-1 xs:grid-cols-2`, `text-2xl md:text-3xl` on the value, `min-w-0` on the card. Mobile becomes scannable; desktop unchanged.
3. **Add scroll affordance to Meta hierarchy table** — Right-edge gradient + horizontal-scroll hint text under the table title on `md:` and below. Users discover the metrics that exist but were hidden.

## Out of scope (do later)
- Sidebar redesign for mobile (sheet/drawer with backdrop instead of inline `<details>`)
- Sticky first column in Meta table (`position: sticky` + bg)
- Skeleton states for charts and tables during hydration
- Dropdown for the user/logout block

Screenshots: see `docs/design-review-screenshots/` (9 files: 6 mobile, 1 tablet, 2 desktop).
