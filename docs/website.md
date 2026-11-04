# The website

The website is two static things, built into one folder:

- `website/`: the landing page (`index.html`, `style.css`, screenshots in `assets/`).
- `app/`: the Daub web app, so "Try it in your browser" works.

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

## Add the domain: daubdesign.app

The project's domain is **daubdesign.app**. If it was bought through Cloudflare (Domain Registration), it is already in your account.

1. Open your Pages project → **Custom domains → Set up a domain**, enter `daubdesign.app`, and confirm. Cloudflare adds the DNS record and the HTTPS certificate for you; it takes a minute or two.
2. Optional: make `www.daubdesign.app` go to the main address. Add `www.daubdesign.app` as a custom domain as well, then in the domain's **Rules → Redirect Rules** send `www.daubdesign.app` to `https://daubdesign.app` (301).
3. The site is then at https://daubdesign.app/ and the web app at https://daubdesign.app/app/.

`.app` domains only work over HTTPS (browsers enforce it), which is what Pages provides by default, so there is nothing to configure.

The site's address appears in a few files: `website/index.html` (canonical and social-preview tags), `website/robots.txt`, `website/sitemap.xml`, and `homepage` in `package.json`. Change them together if the domain ever changes.

## Download buttons

The landing page links to the latest GitHub release and, when it can, reads the release list to show the version and direct links for macOS, Windows and Linux. If that fails it falls back to the *Releases* page, so the buttons always work. The repository is set at the top of `website/index.html` (`const REPO`); change it there if the repository moves.

## Headers

`website/_headers` is read by Cloudflare Pages and sets basic security headers. Nothing else needs configuring.
