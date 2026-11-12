# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added
- **Bring in Processing code.** Paste a real Processing (Java) sketch into the Code tab and Daub converts it to JavaScript: typed variables and arrays, functions, classes with fields and constructors, casts, `ArrayList` / `HashMap`, for-each, `#ff8800` colors, `1.5f`, generics. It also converts when you open the Nodes view or press Run, or with the **Convert Processing code** button, and **Undo conversion** puts the original back. Comments and layout stay as written. `size(w, h)` now sets the canvas size, as in Processing.
- **Make nodes… (sketch → Nodes tab).** Turns a sketch into the Nodes tab's own nodes in a new project: loops become Grid or Ring plus Copy to Points, positions that are off-center get Move Points, sizes, rotations and colors that change from shape to shape become Attribute and Remap, and lines, triangles, quads, `beginShape()` and `bezier()` become Line, Draw and Curve. It reports what it could not convert (text, images, animation, the mouse) and what is only approximate (random places become a Scatter).
- Examples → **Processing (Java) sketches**: ASCII Dither and Bouncing Balls, written in Java as Processing would have them.
- `int()` turns a one-letter string into its character code, and `char()`, `boolean()` and `fullScreen()` exist, for converted sketches.

### Added
- **Projects.** The header shows the project's name (click to rename), a dot that says whether it is saved, and where you are (for example *Code · Nodes*). The new **Projects** menu lists everything you have made in this browser, with New, Duplicate and Delete. Opening an example now starts a new project instead of overwriting the current one, and File → Open… opens a file as a new project. A project remembers which tab you were on. The single sketch an earlier version saved is kept as the project *My sketch*.
- Easier code nodes: drag a number right on its field to change it (click to type), a color swatch on `fill`, `stroke` and `background`, **Duplicate** (Ctrl/Cmd+D) for a node and everything inside it, and dropping a wire on empty space opens the add menu to insert a node there.

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
