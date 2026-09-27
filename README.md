# HawQ-ai website

Static marketing site for HawQ-ai: VanGuard (available now) and Sentinel (in development).
No build step, no framework. Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
```

## Structure

```
index.html            all page content
assets/css/site.css   design tokens (top of file) and styles
assets/js/site.js     hero floor plan, VanGuard pipeline, DORI and Sentinel animations, copy button
assets/favicon.svg
```

## Before going live

- **Contact address.** Every "Book a demo" link uses `contact@hawq-ai.com`. Search and replace it in `index.html` if the address is different.
- **Logo.** The header uses a text wordmark and a simple mark (`.brand` in `index.html`, `assets/favicon.svg`). Swap in the official logo files when available.
- **Demo slots.** The VanGuard demo goes in `#vanguard-demo` (the `.stage` element) and the Sentinel demo in `#sentinel-demo`.

## Content rules

- No customer names, no customer plans, no customer figures. Public figures come from the invented demo building only (10 rooms, 19 cameras, 88.6% → 94.3%).
- The roadmap is not published: no dates, no pricing, and no products other than VanGuard and Sentinel.
- The hero floor plan is an illustration. Its coverage figures are computed live from its own geometry. Its "VanGuard settings" were searched under the rule that no floor covered by the drawn layout may become blind.

## Deploy

Any static host works: OVH web hosting, Netlify, Vercel, Cloudflare Pages or GitHub Pages. Upload the folder as is; the domain root must serve `index.html`.
