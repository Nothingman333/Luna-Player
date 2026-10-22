---
name: luna-ui-consistency
description: "Polish Luna Player React/CSS screens, dialogs, browser and assistant while matching its existing theme, density and accessible interactions."
---

# Luna UI consistency

Use the existing product as the design brief. Inspect app/src/App.css, relevant screen CSS and a neighboring working component. Reuse --bg, --panel, --line, --text, --muted, --accent and existing accent/theme behavior. Current defaults are dark with an orange accent, and other modes/user themes may vary. Do not hardcode orange where a theme token belongs. Preserve IBM Plex Sans, Sora and Literata in their existing roles unless typography is explicitly being changed.

Match established spacing, card sizes, corner radii, focus behavior, icon stroke and text hierarchy. Reuse BrowserIcons, ExtraModal and existing chip/round/list patterns when suitable. Avoid a new visual system, framework, generic landing-page hero or unnecessary persistent toolbar. Distinctive polish can come from better alignment, readable states, useful hierarchy and consistent transitions.

The assistant launcher belongs at the lower right when relevant. A normal click opens a compact overlay above the page; expansion/fullscreen is explicit. Do not shrink the website behind a black right rail or add a full-width footer solely for the assistant. Clear temporary modal overlays and restore focus appropriately.

Use keyboard-reachable controls, visible focus, truthful disabled states, descriptive labels, appropriate dialogs, reduced-motion support and bounded long text. A destructive action and its confirmation should have consistent names. Keep Turkish and English UI support: use current extraText/label/tt patterns and i18n-en.ts entries as applicable.

For layout changes inspect a normal desktop size and a narrow window with synthetic data, then one screenshot if the environment supports it. Headless Vite screenshots are not screenshots of native WebView2 layers. Keep native-layer placement tests separate. Load frontend-design for design judgement or vercel-react-best-practices for a demonstrated rendering issue; the existing theme and actual React/Vite architecture remain the constraints.
