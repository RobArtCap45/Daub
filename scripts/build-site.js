// Assemble the website for hosting (Cloudflare Pages, GitHub Pages, any static host):
//   _site/            the landing page (website/)
//   _site/app/        the Loom web app (app/), so "Try it in your browser" works
// Usage: node scripts/build-site.js     (output folder: _site)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '_site');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'website'), out, { recursive: true });
fs.cpSync(path.join(root, 'app'), path.join(out, 'app'), { recursive: true });
console.log('site built in _site/ (' + fs.readdirSync(out).join(', ') + ')');
