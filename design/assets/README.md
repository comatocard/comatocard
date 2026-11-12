# Design assets

Assets used by the Comatocard design file (`design/comatocard.pen`) and, later, the landing page and app. Collected 2026-11-12.

## Brands (`brands/`)
Rendered to PNG at 1200 px wide with transparent backgrounds, because pen.dev does not render SVG image fills. The SVG next to each PNG is the source.

| File | Source | Notes |
|-|-|-|
| `near.svg`, `near-white.svg` | Inline wordmark on https://near.org (header and footer). NEAR publishes no brand kit. | The site SVG uses `currentColor`; black for light backgrounds, white for dark ones, as the site renders it. |
| `near-ai.svg`, `near-ai-black.svg`, `near-ai-white.svg` | NEAR AI brand guidelines, https://near.ai/brand (`/branding/logos/primary/primary-*.svg`) | Kit rules: clear space 22% of logo height, minimum width 120 px. |
| `near-intents.svg` | https://intents.near.org/images/near-intents-logo-v2a.svg | The "near" part is white: use it on dark backgrounds only. |
| `meteor-wallet-mark.svg` | Mark cut from the header logo on https://meteorwallet.app | Mark only; the official wordmark text is white. |

Sputnik DAO has no logo file in its repositories (the GitHub organisation avatar is a default identicon), so it is set as text.

Every SVG was checked: real SVG, no `<script>`, no event handlers, no external references.

## Media (`media/`)
| File | Source |
|-|-|
| `story-1-card.jpg` to `story-4-portal-glow.jpg` | Hero background frames from the frontend owner's earlier card site (owned by the team), converted to JPEG. |
| `lock.png`, `shield.png`, `profile.png`, `network.png`, `buy-anything.png`, `flags-ring.jpg`, `topup-card-poster.png` | Same earlier site, converted from AVIF/WebP. |
| `topup-wallet.png`, `globe.png` | Frames from `video/topup-card.webm` (0.1 s, wallet closed) and `video/counter.mp4`. |
| `soft-horizon-*.jpg`, `pastel-mist-*.jpg` | Frames from MotionSites premium gradients (team plan): Soft Horizon `58b31689-2e01-4712-8c63-1471b0e8b41e`, Pastel Mist `c430d028-3559-4f59-856d-0665d61f6530`. The source videos are 108 to 140 MB and are not stored here; fetch them with the MotionSites MCP `get_background_video`. |

`video/topup-card.*` briefly shows third-party bank and card network brands mid-animation; trim it to the closed-wallet part before using it on the site.

## Video (`video/`)
`intro.mp4` (card coming alive), `topup-card.webm/.mov` (wallet), `counter.mp4` (globe), `new-countries.*` (flag ring). From the same earlier site.

## Shaders (`../shaders/`)
Animate nodes on the pen.dev canvas through `@time`; the site implements the same motion in CSS (see the Motion spec frame in the design file).

| File | Effect |
|-|-|
| `float.glsl` | Slow float and tilt for 3D icons, phase-shifted per icon |
| `shine.glsl` | Periodic light sweep across a card face |
| `marquee.glsl` | Seamless horizontal loop for the "Built on" logo strip |
| `spinner.glsl` | Rotating arc with a fading tail for the Loader component |
| `shimmer.glsl` | Light sweep across skeleton screens while data loads |
