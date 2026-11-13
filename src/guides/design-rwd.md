# Responsive Page and Visual Design

Use these rules for any SlimWeb task involving page layout, visual design, theme sections, landing pages, product pages, article pages, navigation, banners, cards, forms, tables, or media.

## Non-Negotiable RWD Rule

Every page or layout design must include mobile, tablet, and desktop behavior. If the user only says "two columns", "large hero", "grid", "card list", or any desktop-shaped instruction, automatically translate it into responsive behavior.

The agent must not create a desktop-only layout.

## Breakpoint Thinking

- Mobile: single-column first, readable text, touch targets at least 44px, primary CTA visible without awkward scrolling when possible.
- Tablet: preserve scanability; two columns only when content still has enough width.
- Desktop: use available width for hierarchy, comparison, and side-by-side content.

## Layout Rules

- Multi-column sections must define how they collapse on mobile.
- Hero sections must define image crop/focal point, text order, and CTA placement on mobile.
- Product grids must define card count per row for mobile, tablet, and desktop.
- Tables should become cards, simplified columns, or controlled horizontal scroll on mobile.
- Forms must preserve visible labels, clear errors, and mobile input types.
- Navigation must define mobile menu behavior, cart/login placement, and icon treatment.
- Navigation acceptance includes 1536px and 1800px because SlimWeb's full desktop menu starts at 2xl; verify top-level links remain on one row and measure navbar height.
- Open login, mobile-menu, and cart overlays. Their bounding rectangles must remain within the viewport even when the navbar uses `backdrop-filter`, `filter`, `transform`, `contain`, or `perspective`.
- Floating actions must define fixed-edge spacing, safe-area behavior, stacking order, and non-overlapping touch targets on mobile.

## Visual Safety Checks

- Text must not overflow containers or overlap images.
- Buttons must keep readable labels and sufficient touch size.
- Images must scale proportionally unless an intentional crop and focal point are specified.
- Avoid fixed heights that truncate content on mobile.
- Do not depend on hover-only interactions.
- Keep CTA hierarchy clear on every breakpoint.

## Design Output Pattern

When planning or summarizing a page design, include:

- Desktop layout.
- Tablet behavior.
- Mobile behavior.
- Image/media handling.
- Navigation or CTA behavior if affected.
- Any unsupported or risky requirement.

## Common Corrections

- "Two columns" becomes desktop two columns, tablet conditional two columns, mobile stacked sections.
- "Full screen hero" becomes desktop immersive hero, mobile content-first hero with safe image crop.
- "Product comparison table" becomes desktop table, mobile comparison cards or horizontal scroll.
- "Put image beside text" becomes desktop side-by-side, mobile image/text order chosen for conversion and readability.
