# The website

The website is two static things, built into one folder:

- `website/`: the landing page (`index.html`, `style.css`, screenshots in `assets/`).
- `app/`: the Loom web app, so "Try it in your browser" works.

`npm run build:site` (or `node scripts/build-site.js`) copies both into `_site/`:

```
_site/
├── index.html        the landing page
├── style.css, assets/…
└── app/              the web app (served at /app/)
```

It is plain HTML, CSS and JavaScript. There is nothing to compile, so any static host works.

## Host it on Cloudflare Pages (free)

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git** and choose this repository.
2. Build settings:
   - **Build command:** `node scripts/build-site.js`
   - **Build output directory:** `_site`
   - Environment variable (if asked): `NODE_VERSION` = `22`
3. Save and deploy. Every push to `main` redeploys the site, and every pull request gets a preview link.

## Add your domain

Buy the domain in **Domain Registration** in the same Cloudflare account (Cloudflare sells domains at cost, with no markup). Then open your Pages project → **Custom domains → Set up a domain** and enter it. Cloudflare creates the DNS records and the HTTPS certificate for you. Add `www` as a second custom domain if you want both to work.

## Download buttons

The landing page links to the latest GitHub release and, when it can, reads the release list to show the version and direct links for macOS, Windows and Linux. If that fails it falls back to the *Releases* page, so the buttons always work. The repository is set at the top of `website/index.html` (`const REPO`); change it there if the repository moves.

## Headers

`website/_headers` is read by Cloudflare Pages and sets basic security headers. Nothing else needs configuring.
