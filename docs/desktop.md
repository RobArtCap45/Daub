# The desktop app

The desktop app is the same web app in an [Electron](https://www.electronjs.org/) window, with a native menu and installers for macOS, Windows and Linux. All of its code is in `desktop/`.

| File | What it does |
| --- | --- |
| `desktop/main.js` | Opens the window, builds the native menu, keeps the page locked down, and runs the `--smoke-test`. |
| `desktop/preload.js` | Gives the page one small object, `window.daubDesktop`, so menu items can press the app's buttons. |
| `desktop/build/icon.png` | The app icon (1024 × 1024). electron-builder turns it into `.icns` and `.ico` files. |

## Run it

You need [Node.js](https://nodejs.org/) 22.12 or newer (the repo has an `.nvmrc`).

```bash
npm install
npm start
```

To try the web version without Electron: `npm run web`, then open http://localhost:8080.

## Build installers

```bash
npm run pack         # a quick unpacked build in dist/, to try the packaged app
npm run dist:mac     # .dmg and .zip (Apple Silicon and Intel)       — run this on a Mac
npm run dist:win     # installer and portable .exe                   — run this on Windows
npm run dist:linux   # .AppImage and .deb                            — run this on Linux
```

Each platform is built on its own system. You do not have to do this by hand: the **Release** workflow builds all three.

## Release with GitHub Actions

1. Update `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Commit, then tag and push:

   ```bash
   git tag v0.1.0
   git push origin main --tags
   ```
3. The **Release** workflow builds macOS, Windows and Linux and attaches the installers to a **draft** release at *Releases* on GitHub. Check them, write the notes, press **Publish**.

You can also run the workflow by hand (*Actions → Release → Run workflow*). That builds everything and keeps the installers as downloadable artifacts, without making a release.

## Code signing (optional, but recommended before sharing widely)

Without signing, the installers work, but each system warns people:

- **macOS** says the app is from an unidentified developer. People can right-click → *Open* the first time. On Apple Silicon an unsigned app may need `xattr -cr /Applications/Daub.app` after downloading.
- **Windows** SmartScreen says “Windows protected your PC”. People choose *More info → Run anyway*.

To sign, add these **repository secrets** (*Settings → Secrets and variables → Actions*). The workflow already reads them; when they are missing it just skips signing.

| Secret | Platform | What it is |
| --- | --- | --- |
| `MAC_CSC_LINK` | macOS | Your *Developer ID Application* certificate as a `.p12`, base64-encoded (`base64 -i cert.p12 \| pbcopy`). |
| `MAC_CSC_KEY_PASSWORD` | macOS | The password you set when exporting the `.p12`. |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS | For notarization, which removes the warning. |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows | A code-signing certificate (`.pfx`, base64-encoded) and its password. |

An Apple Developer account costs about $99 a year. Windows certificates cost money and vary by provider. Start without them.

Notarization has not been tested yet (it needs an Apple account). If macOS still warns after you add the secrets, check electron-builder's notarization documentation: the `build.mac.notarize` setting in `package.json` may need to be switched on.

## How it stays safe

- The page has no access to Node.js (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`).
- Links that leave the app open in your browser; the window cannot navigate to a website.
- The page has a Content-Security-Policy that blocks remote scripts and network requests. (`'unsafe-eval'` is allowed because the Code tab runs your own sketches.)
- Permissions such as camera, microphone and location are always refused.

## The smoke test

```bash
npx electron . --smoke-test
```

Opens the app without showing a window, checks that the preload bridge exists, that all four workspaces work, that a script round-trips and that a code sketch draws, and exits `0` or `1`. CI runs this on every push (`xvfb-run -a npx electron . --smoke-test --no-sandbox --disable-gpu`).

## Known limits

- The first launch loads the Inter and JetBrains Mono fonts from Google Fonts. Offline, the app falls back to system fonts. Bundling the fonts is on the roadmap.
- Auto-update is not set up yet.
