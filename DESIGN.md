# Auteur interface language

The application is a working instrument: a dark, quiet shell around a bright screenplay page. Use restrained amber for the primary accent. The visual reference is an editing room or flatbed machine, not a decorative dashboard.

## Invariants

- Square controls and panels; status dots are the only rounded elements.
- One-pixel borders. Reserve shadows for the screenplay page.
- One amber accent. Scene and character colors communicate data, not branding.
- Courier Prime for screenplay pages and measurements; IBM Plex Sans Condensed for the application shell.
- Use uppercase, letter-spaced section labels sparingly.

## Core palette

| Role | Value |
| --- | --- |
| App background | `#0e1013` |
| Top and bottom bars | `#14171c` |
| Side panels | `#12151a` |
| Page surround | `#0a0c0e` |
| Controls | `#1a1f26` |
| Active tab | `#1e232a` |
| Primary text | `#eef1f5` |
| Secondary text | `#a9b0bb` |
| Amber | `#e0932f` |
| Amber hover | `#f0ad55` |
| Amber surface | `#2a2118` |
| Page | `#f7f5f0` |
| Page ink | `#1c1a17` |

Borders generally range from `#1e232a` to `#2b313a`; the amber border is `#43331f`. Keep contrast readable while preserving the restrained palette.

## Layout baseline

The original screenplay layout uses a 44 px application bar, a 38 px formatting bar, a 34 px lower bar, a 222 px navigator, and a 268 px inspector. These are reference measurements, not a reason to force the same panels into every mode. The page is the focal point; mode-specific controls should appear only where useful.

The shot strip opens from the lower bar. Its reference thumbnail size is 148 × 84 px and the selected item has an amber border.

Focus mode removes surrounding controls. It keeps one centered page, quiet scene progress at the top, counters at the lower left, and save status plus an Escape hint at the lower right. Escape exits focus mode.

New surfaces should inherit the same palette, border weight, typographic roles, and measured spacing. Add a new accent or control language only when it communicates a real distinction.
