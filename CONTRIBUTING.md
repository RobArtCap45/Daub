# Contributing to Daub

Thank you for helping. You do not need to be a programmer: bug reports, ideas, examples and docs are just as useful as code.

## Quick ways to help

- **Report a bug.** Open an [issue](https://github.com/RobArtCap45/Daub/issues/new/choose). What you did, what you expected, what happened. A saved sketch (File → Save) attached to the issue helps a lot.
- **Suggest something.** Describe what you are trying to make; that is more useful than describing a feature.
- **Write an example.** An example in Examples shows people what is possible. See below.
- **Improve the docs.** If something confused you, it will confuse others.

## Set up

You need [Node.js](https://nodejs.org/) 22.12 or newer and Git.

```bash
git clone https://github.com/RobArtCap45/Daub.git
cd Daub
npm install
npm start          # the desktop app
npm run web        # or: the web app at http://localhost:8080
npm test           # run this before you open a pull request
```

The web app needs no build step. Edit a file in `app/src/`, reload the page, and you see the change. [docs/architecture.md](docs/architecture.md) explains how the code is organized.

## Making a change

1. Fork the repository and make a branch: `git checkout -b my-change`.
2. Make your change. Keep it focused: one idea per pull request.
3. Run `npm test`. If you changed or added a node, run `npm run docs` too and commit the updated `docs/node-reference.md`.
4. Open a pull request and fill in the template. Screenshots or a short screen recording are welcome for anything visual.

CI runs the tests and starts the desktop app on every pull request.

### Code style

- Plain JavaScript, no framework, no build step. Match the file you are editing: two spaces, single quotes, semicolons.
- `app/src/engine.js` and `app/src/script.js` must stay free of the DOM (no `document`, no `window` APIs except the one global `window.Daub`), so the tests can load them in Node.
- Wording the user sees should be plain: "shapes" and "points", not "geometry" and "vertices". Error messages should say what to do next.
- Add a test for behavior you add or fix. Geometry tests check exact numbers (areas, positions), not "it did not crash".

### Adding a node, an example, a test

See [docs/architecture.md](docs/architecture.md#adding-a-node). In short: add the node to `NODES` in `engine.js` with a one-line description, run `npm run docs`, add a test.

## Originality and licensing

Daub is released under [CC0](LICENSE), so everything in this repository has to be something we are free to dedicate to the public domain. That means:

- **Write your own examples, docs and code.** Do not copy example programs or documentation text from Processing, NodeBox, p5.js, Rive, or anywhere else. Their licenses differ from this project's. Re-implementing a well-known *algorithm* (Game of Life, Koch curves, boids) in your own words and your own code is fine.
- Do not paste code from Stack Overflow, Copilot-style tools, or other projects unless you are sure of its license.
- By opening a pull request you agree that your contribution is dedicated to the public domain under CC0.

## Releasing (maintainers)

See [docs/desktop.md](docs/desktop.md#release-with-github-actions): bump the version, update `CHANGELOG.md`, push a `v*` tag, review the draft release.

## Be kind

Read the [code of conduct](CODE_OF_CONDUCT.md). Creative tools get better when more kinds of people feel welcome to use and shape them.
