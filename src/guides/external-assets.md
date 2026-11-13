# External CSS and JavaScript

Use this when the user asks to add custom CSS, custom JavaScript, third-party widgets, pixels, analytics, chat plugins, embeds, fonts, animation libraries, or external assets to a SlimWeb site.

## Core Rules

- External CSS/JS must have a clear purpose and placement.
- Do not add third-party scripts without considering trust, performance, privacy, and page breakage.
- Do not use external CSS/JS to bypass SlimWeb settings when a supported MCP tool exists.
- Keep custom code scoped as narrowly as possible: page-level before global when the change is page-specific.
- Preserve existing custom code unless replacement is explicitly requested.
- Page visual JavaScript may use inline code plus supported `enabled_libraries`: `animate_css`, `aos`, `swiper`, `gsap`, `scrolltrigger`, and `scrollsmoother`. Do not add external CDN tags manually.
- Theme fragments (`navbar`, `floating_actions`, and `footer`) do not load JavaScript or Theme-level `enabled_libraries`.

## Responsive and Visual Impact

Before adding CSS/JS that affects layout or visuals:

- Check mobile, tablet, and desktop behavior.
- Avoid fixed widths, fixed heights, and absolute positioning that breaks mobile.
- Avoid scripts that depend on hover-only interaction.
- Avoid layout shifts after load.
- Confirm external fonts do not cause severe flash or slow rendering.

## Safety Checks

Ask for confirmation when:

- The script collects user data.
- The script modifies checkout, payment, login, cart, or order flow.
- The source domain is unknown or untrusted.
- The code is minified and the intent is not clear.

Reject or warn when:

- The script attempts to steal credentials or tokens.
- The code hides required legal, price, payment, or order information.
- The CSS makes text unreadable or inaccessible.
- The code conflicts with SlimWeb's supported page or commerce workflows.

## Placement Guidance

- Global CSS/JS: use only the dedicated platform setting or integration intended for that behavior; do not smuggle it into Theme fragments.
- Page CSS/JS: for a landing page, campaign page, or special visual effect.
- Component/section style: preferred when the MCP page tool supports scoped section styling.
