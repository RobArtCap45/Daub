# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Code as nodes.** The Code tab has a Text / Nodes switch. *Nodes* shows the very same sketch as a graph where every statement (a call, a variable, a loop, an if, a function) is a node and the wires say what runs next. Edit the nodes or the text and the other follows. Drag a number's label to scrub it and watch the sketch change; loops, ifs and functions open to show what is inside; a node that is not wired to Start does not run. Code with no node of its own is kept as a Raw node, so nothing is lost. The Nodes tab links straight to it.
- **Images in the Code tab:** `loadImage`, `createImage`, `image`, `img.resize / loadPixels / updatePixels / get`, `pixels[]`, plus `brightness`, `createFont` and `textFont`. `loadImage()` gives a built-in demo picture until you use **Load image…** (or drop a picture on the preview).
- Code example **Images → ASCII Dither**: a picture turned into colored blocks of text, with Bayer dithering.
- Save files are now version 3 and also remember the layout of the code's nodes. Older files open as before.

## [0.1.0]

First public version.

### Added
- **Design** workspace: shapes, bezier pen, layers, inspector, alignment and snapping, keyframe timeline with easing, PNG / SVG / WebM export.
- **Nodes** workspace: 45 nodes including bezier paths, Compound (union, subtract, intersect, xor), Align, Distribute, Design node, SVG import; custom nodes.
- **Script** language: a text form of node graphs that compiles in both directions, with `def` for your own nodes.
- **Code** workspace: Processing-style JavaScript with mouse and keyboard events and `PVector`; 61 original example sketches.
- Desktop app for macOS, Windows and Linux (Electron), a project website, CI and release workflows.
