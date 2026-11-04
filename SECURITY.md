# Security

## Reporting a problem

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead: on the repository go to **Security → Report a vulnerability**. Include what you found, how to reproduce it, and which version or platform.

You will get an answer as soon as a maintainer can read it. This is a small volunteer project, so please be patient.

## What counts

Loom runs sketches you write or open. By design the Code tab runs your own JavaScript on the page, so "a sketch can run JavaScript" is not a vulnerability. These are:

- A saved `.loom.json` sketch, an imported SVG or a script that makes the app do something the user did not ask for outside the page (read files, reach the network, run programs).
- A way for a web page or a file to escape the desktop app's sandbox or gain Node.js access.
- Problems in the build or release workflow that could ship a tampered installer.

The desktop app has Node.js integration turned off, the page sandboxed, a Content-Security-Policy, refused permissions and blocked navigation (see [docs/desktop.md](docs/desktop.md#how-it-stays-safe)).

## Which versions

The latest release and the `main` branch.
