---
name: Proyecto Severo — Relevamientos
description: Field-canvassing PWA for territorial citizen surveys in Maipú, PBA.
colors:
  primary: "#0D47A1"
  primary-dark: "#083B87"
  primary-light: "#E3F2FD"
  primary-mid: "#1255A8"
  accent-teal: "#00897B"
  gold: "#FFC845"
  bg: "#F4F6F9"
  surface: "#FFFFFF"
  border: "#DDE1E7"
  text: "#1A1A2E"
  text-2: "#5C6677"
  error: "#C62828"
  success: "#2E7D32"
  warn: "#E65100"
  on-primary: "#FFFFFF"
  success-bg: "#E8F5E9"
  success-border: "#A5D6A7"
  warn-bg: "#FFF3E0"
  warn-border: "#FFCC80"
  error-bg: "#FFEBEE"
  warn-text: "#B23E00"
  accent-text: "#00695C"
  type-ciudadano: "#3B82F6"
  type-problematica: "#F59E0B"
  type-sociohabitacional: "#10B981"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  pill: "20px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "14px 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "14px 24px"
    height: "48px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "14px 24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "12px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "44px"
  chip-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
  filter-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  filter-tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
---

# Design System: Proyecto Severo — Relevamientos

## 1. Overview

**Creative North Star: "The Territorial Constellation"**

Severo's identity is a constellation: deep institutional blue as the night, gold as the single bright node, and a network of households plotted across the territory of Maipú. The whole interface answers to that image. Blue carries the surface and every primary action; gold is the rare spark reserved for the brand mark, never spent on ordinary UI. The system reads the way the project wants to be seen at the door: confident, modern, capable, a well-run operation rather than a hobby project or a legacy government form.

The aesthetic is crisp and modern. Flat white surfaces sit on a cool off-white field (`#F4F6F9`), separated by hairline borders rather than heavy shadows. Corners are gently softened (12px), type is the native system stack so it renders fast and familiar on any phone, and hierarchy comes from weight and uppercase eyebrow labels, not ornament. Depth is used sparingly and only with intent: a gradient header, an elevated install card, a blocking update modal. Everything else stays calm and legible so the citizen's data leads.

This system explicitly rejects the **clunky government portal**: no gray dense forms, no lifeless institutional type, no bureaucratic coldness. It also rejects **flashy startup SaaS** (gradient heroes as decoration, emoji confetti), the **cluttered enterprise CRM** (tabs and chrome competing on one screen), and any **surveillance / police-tool** chill that would alarm a person standing at their own door. The tool earns trust by being obviously competent, not by decorating itself.

**Key Characteristics:**
- Deep-blue dominant surface with a single reserved gold accent.
- Flat, bordered cards on a cool off-white field; shadow signals elevation or state, never sits at rest.
- Native system sans for speed and familiarity; uppercase eyebrow labels for structure.
- Oversized touch targets tuned for one-handed use in direct sun.
- Functional color-coding: each relevamiento type owns a fixed accent hue.

## 2. Colors

A government-grade blue palette anchored by one gold spark, with three functional type-accents and a clear semantic set for state.

### Primary
- **Constellation Blue** (`#0D47A1`): the brand and the workhorse. Primary buttons, active states, links, section-label text, progress fill, focused input borders. The single dominant hue across the app.
- **Deep Night Blue** (`#083B87`): primary-button hover and the dark end of the header and auth gradients. The blue pressed one shade darker.
- **Horizon Blue** (`#1255A8`): the light end of the header gradient; used only to give the blue header dimensional movement.
- **Dawn Blue** (`#E3F2FD`): pale wash for hover and selected backgrounds (chips, type cards, radio options) and the underline beneath eyebrow section titles. Tells the user "this is the active one" without shouting.

### Secondary
- **Severo Gold** (`#FFC845`): the bright node of the constellation. Reserved for the brand mark and logo only. It is never a UI accent, never a button, never a highlight.

### Tertiary
- **Signal Teal** (`#00897B`): the *Padrón* provenance badge, marking data that came from the electoral roll. A trust signal, used only there.
- **Ciudadano Blue** (`#3B82F6`), **Problemática Amber** (`#F59E0B`), **Sociohabitacional Green** (`#10B981`): the three relevamiento-type accents. Each survey type owns one fixed hue, shown as the left edge of its list card so a volunteer can scan type at a glance.

### Neutral
- **Ink Navy** (`#1A1A2E`): primary text and the toast/dark-badge background. A near-black tinted toward the brand blue, never pure `#000`.
- **Slate Gray** (`#5C6677`): secondary text, captions, inactive labels, hints.
- **Hairline Gray** (`#DDE1E7`): borders, dividers, rest-state control strokes.
- **Field Off-White** (`#F4F6F9`): the app background the white cards float on.
- **Card White** (`#FFFFFF`): cards, inputs, headers, sheets.

### Semantic
- **Alert Red** (`#C62828`): errors, required markers, destructive actions, electoral absence.
- **Confirm Green** (`#2E7D32`): success, resolved state, electoral participation.
- **Caution Orange** (`#E65100`): warnings, "persiste" state, not-configured notices.

### Semantic surface tints
Each state color pairs a soft background with a soft border, so state reads as a calm tint behind dark-on-light text, never a loud fill. These are tokens (`--success-bg`, `--warn-bg`, etc.), not inline values.
- **Confirm Surface** (`#E8F5E9` bg / `#A5D6A7` border): resolved badges and the active "resuelto" toggle.
- **Caution Surface** (`#FFF3E0` bg / `#FFCC80` border): "persiste" badges and toggles.
- **Alert Surface** (`#FFEBEE` bg): destructive hover, e.g. the remove-member button.

### Text-safe state shades
`--warn` (`#E65100`) and `--accent` (`#00897B`) are tuned for fills, borders, and icons; as *text* on light surfaces they fall just under WCAG AA (≈3.5–4.3:1). Two darker shades carry the text role and clear AA:
- **Warn Text** (`#B23E00`, token `--warn-text`): "persiste" labels, caution toggles, photo warnings. ≈5.4:1 on white and on `--warn-bg`.
- **Accent Text** (`#00695C`, token `--accent-text`): the *padrón* badge label. ≈6.6:1 on white, ≈5.7:1 on `--accent-soft`.

### Foreground on color
- **On-Primary White** (`#FFFFFF`, token `--on-primary`): the single source for text and icons sitting on blue, navy, or dark surfaces. White stays pure here on purpose: contrast on saturated blue under sun glare outranks the no-pure-white guideline. The subtle white overlay for borders and hovers on those surfaces is the `--overlay-soft` token (`rgba(255,255,255,.16)`).

### Named Rules
**The Gold-Spark Rule.** Gold (`#FFC845`) belongs to the brand mark alone. It is the one bright node in the constellation; spending it on buttons or highlights destroys its meaning. If something needs emphasis, use weight, size, or Constellation Blue, never gold.

**The Type-Hue Rule.** Each relevamiento type owns exactly one accent (ciudadano blue, problemática amber, sociohabitacional green). These hues mean "what kind of record this is" and may not be reused decoratively elsewhere.

**The Single-White Rule.** White text and icons on any colored or dark surface come from one token, `--on-primary`. Never type a raw `#fff`; if you reach for white, reach for the token.

## 3. Typography

**Display / Body Font:** the native system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`). One family does everything.
**Mono Font:** the platform monospace (`monospace`), used only for machine values: GPS coordinates and codes.

**Character:** deliberately unbranded and instantly familiar. Using the device's own UI font means zero load time, perfect rendering on any field phone, and a tone that reads as "system tool," not "marketing site." Personality comes from weight and structure, not from a typeface.

### Hierarchy
- **Display** (800, 1.75rem, line-height 1.1, letter-spacing -0.5px): the auth-screen logo title only. The one heroic moment.
- **Headline** (700, 1.35rem, line-height 1.2): screen heroes such as a citizen's name on the padrón-detail screen.
- **Title** (700, 1.1rem): card titles, type-card titles, modal titles.
- **Body** (400–600, 1rem / 16px, line-height 1.5): question labels, field values, running text. 16px is a hard floor, never smaller for editable text (it stops iOS auto-zoom on focus).
- **Label** (700, 0.68–0.78rem, uppercase, letter-spacing 0.06–0.08em): the signature eyebrow. Section headers, block headers, field-group labels, card type tags. Colored Constellation Blue when it titles a section, Slate Gray when it tags a row.

### Named Rules
**The 16px Floor Rule.** Any input or textarea renders at a minimum of 16px. Below that, iOS Safari zooms on focus and throws the volunteer out of their flow at the door. Non-negotiable.

**The Eyebrow Rule.** Structure is signalled by small, bold, uppercase, letter-spaced labels, not by big headings. They organize dense field data without adding vertical weight.

## 4. Elevation

Hybrid, leaning flat. Surfaces are flat at rest: white cards separated from the off-white field by 1–2px hairline borders, never by a resting shadow. Shadow is a signal, not a texture. It appears to mean elevation (the sticky header, a floating toast) or state (a survey card lifts on hover) or urgency (the blocking update modal). The deeper the shadow, the more the element is asking for attention. Every shadow is tinted with the brand navy (`rgba(6,34,79,…)`), never neutral black, so depth stays in the family.

### Shadow Vocabulary
- **Resting Subtle** (`box-shadow: 0 1px 2px rgba(6,34,79,.06), 0 1px 1px rgba(6,34,79,.04)`): the faintest grounding; tooltips, the Google button. Barely there.
- **Ambient Card** (`box-shadow: 0 4px 16px rgba(6,34,79,.10)`): the hover lift on survey cards, type cards, citizen results.
- **Header Lift** (`box-shadow: 0 1px 0 rgba(6,34,79,.10), 0 6px 18px rgba(6,34,79,.16)`): the sticky gradient header, with a hairline seam holding it above scrolling content.
- **Pop** (`box-shadow: 0 12px 32px rgba(6,34,79,.20)`): floating elements that sit clearly above the page, the toast, the install card, the auth card.
- **Modal Weight** (`box-shadow: 0 24px 64px rgba(6,34,79,.42)`): the blocking update box, paired with a navy backdrop blur. Maximum elevation for the one moment the app must interrupt.

### Named Rules
**The Flat-At-Rest Rule.** A card sitting still has a border, not a shadow. Shadow is earned by interaction (hover/press) or by floating above the page (header, toast, modal). If a static panel has a drop shadow for decoration, remove it.

## 5. Components

Components are crisp and modern: clean strokes, a soft 12px radius, generous interior space, and touch targets sized for a thumb in a hurry. All state changes ride a single ease-out curve (`cubic-bezier(.22, 1, .36, 1)`) at 120–180ms, and controls dip 1px on press for tactile feedback. No bounce, no decorative motion.

### Buttons
- **Shape:** softened rectangle (12px radius), min-height 48px, weight 600, 14px×24px padding.
- **Primary:** filled Constellation Blue, white text. Hover deepens to Deep Night Blue (`#083B87`).
- **Outline:** transparent with a 2px Constellation Blue border and blue text; hover fills with Dawn Blue.
- **Ghost:** transparent, Slate Gray text; hover fills Hairline Gray. For low-priority and cancel actions.
- **Google sign-in:** the Material-standard white button (`#fff`, 1px `#dadce0` border, 4px radius). Left as-is, deliberately, so it reads as the trusted Google control.
- **Block:** any variant at full width; the default for primary screen actions.

### Chips & Filter Tabs
- **Chips:** full pills (20px radius), 2px Hairline border, min-height 44px. Selected → filled Constellation Blue, white text. For multi-select survey answers.
- **Filter tabs:** lighter pills (1.5px border) in a horizontally scrolling bar, each with a count badge. Active → filled blue; the count badge inverts to a translucent-white pill.

### Cards / Containers
- **Corner Style:** 12px radius (the `--radius` token); larger surfaces like the update modal scale to 18px.
- **Background:** Card White on the off-white field.
- **Shadow Strategy:** flat at rest (see Elevation); lift to Ambient Card on hover.
- **Border:** 1px Hairline at rest; on hover or select, the border shifts to Constellation Blue and the background washes Dawn Blue.
- **Internal Padding:** 12–20px depending on density.

### Survey Card (signature)
A horizontal list row led by a small colored type dot (9px) that encodes the relevamiento type (ciudadano blue / problemática amber / sociohabitacional green), a body (type eyebrow, barrio pill, title, subtitle, date, coords), and a chevron that turns blue and nudges right on hover. The dot is a functional type-legend; type is never encoded as an edge stripe.

### Inputs / Fields
- **Style:** Card White, 2px Hairline border, 8px radius, 12px padding, 16px text.
- **Focus:** border shifts to Constellation Blue plus a 3px soft-blue focus ring (`0 0 0 3px rgba(13,71,161,.34)`). Every interactive control carries this same ring on `:focus-visible`, so keyboard and switch users always see where they are.
- **Selection controls:** radio rows (min-height 52px), scale buttons (min-height 64px), large by design. Native radios use `accent-color: var(--primary)`.

### Navigation / Header
- **App header:** a left-to-right blue gradient (`#083B87 → #0D47A1 → #1255A8`), white logo + title, sticky at top with Header Lift shadow. Icon buttons are 36px white-on-blue hit targets.
- **Auth screen:** a 160° blue gradient field with a white card floating in it. The one fully "branded" surface.

### Badges
- **Padrón badge:** teal text on `#E0F2F1`, marking roll-sourced data.
- **Estado badges:** pendiente (neutral), persiste (orange on `#FFF3E0`), resuelto (green on `#E8F5E9`).
- **Fallecido badge:** Ink Navy fill, white text. Sober, never alarming, for deceased-citizen marking.

## 6. Do's and Don'ts

### Do:
- **Do** keep Constellation Blue (`#0D47A1`) as the single dominant hue: primary actions, active states, links, eyebrow titles.
- **Do** reserve Severo Gold (`#FFC845`) for the brand mark only (the Gold-Spark Rule).
- **Do** size touch targets for one hand in sunlight: 48px buttons, 44px chips, 52px radio rows, 64px scale buttons. Never shrink these for density.
- **Do** render every input at 16px minimum to prevent iOS focus-zoom (the 16px Floor Rule).
- **Do** signal structure with small uppercase eyebrow labels, not large headings (the Eyebrow Rule).
- **Do** keep surfaces flat at rest with hairline borders; let shadow mean elevation or state (the Flat-At-Rest Rule), and tint every shadow with the brand navy, never neutral black.
- **Do** give every interactive control a visible `:focus-visible` ring; if you remove a browser outline, replace it with the soft-blue ring.
- **Do** use the fixed type-hues (blue/amber/green) only to mean relevamiento type.
- **Do** make every error recoverable and plainly worded; pair destructive or sensitive actions (eliminar, fallecido) with clear, calm confirmation.

### Don't:
- **Don't** build the clunky government portal: no gray dense forms, no lifeless institutional type, no bureaucratic chrome. This is the strongest prohibition.
- **Don't** drift toward flashy startup SaaS: no decorative gradient heroes, no emoji confetti, no marketing-app energy.
- **Don't** crowd a screen like an enterprise CRM: no competing tabs, toolbars, and chrome on one view. One primary task per screen.
- **Don't** let the interface feel like a surveillance or police tool. Handle citizen data (address, welfare flags, deceased status) with visible care; nothing cold or harvesting at the door.
- **Don't** spend gold on UI, add a second accent hue, or reuse a type-hue decoratively.
- **Don't** use a colored side-stripe edge on any card, list row, or callout. Encode meaning with a leading dot, label, or icon instead (the Survey Card uses a leading type dot).
- **Don't** put a drop shadow on a static, resting panel; if it isn't elevated or interacting, it gets a border.
- **Don't** introduce a custom display typeface; the native system stack is the deliberate choice.
