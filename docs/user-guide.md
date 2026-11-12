# User guide

Daub has four workspaces, switched with the tabs at the top. They all work on the same sketch, and **File → Save** keeps everything in one `.daub.json` file.

| Tab | What it is for |
| --- | --- |
| **Design** | Draw shapes by hand and animate them on a timeline. |
| **Nodes** | Build generative art by wiring nodes together. |
| **Script** | The same node graph as text. See the [language guide](script-language.md). |
| **Code** | Processing-style JavaScript. See the [code API](code-api.md). Switch to **Nodes** to edit the same code as a graph. |

Not sure where to start? Open **Examples** in the top bar and pick one.

## Design tab

- **Draw:** pick a tool on the left and drag on the artboard: Rectangle (R), Ellipse (O), Polygon (Y), Star (S), Line (L). A plain click makes a 100 px shape.
- **Pen (P):** click for corner points, click-and-drag for smooth curves, click the first point to close, Enter to finish. Double-click a path with the Select tool to edit its points.
- **Select (V):** click, Shift+click or drag a box to select. Drag to move (snaps to the artboard and other layers; hold Alt to turn snapping off). Drag handles to resize (Shift keeps proportions, Alt resizes from the center). Drag the round handle to rotate (Shift snaps to 15°).
- **Inspector:** position, size, rotation, corner radius / sides / star inner size, opacity, fill, stroke. Drag a label to scrub a value. The align buttons line shapes up with the artboard (or with each other).
- **Layers:** click to select, drag to reorder, eye to hide, lock, double-click to rename. Duplicate (Ctrl/Cmd+D), Delete, `[` and `]` to send back or forward, arrow keys to nudge.
- **Animate:** every number has a ◇ next to it. Move the playhead and click ◇ to add a keyframe. Once a value has keyframes, changing it at another time adds a new one automatically. Drag keyframes in the timeline, pick **Easing to next key** (smooth, linear, ease in/out, overshoot, bounce, hold), set the duration, turn looping on or off.
- **Export:** File → PNG, SVG (vector, at the current frame) or WebM video (records the animation).

## Nodes tab

You do not need to program for this.

1. Open **Examples** and pick one, then change things.
2. **Add a node:** double-click empty space and search (for example "circle", "grid", "wave", "design", "compound").
3. **Connect:** drag from the dot on the right of a node to a dot on the left of another. Drag a connected dot away to unplug it.
4. **Change a value:** type in the box, or drag its label left or right (hold Shift for fine control).
5. Everything flows into the **Output** node, which is what you see on the canvas.

Select several nodes with Shift+drag or Shift+click. Scroll to zoom, press F to fit everything on screen, press Space to play or pause.

**Design node:** brings everything from the Design tab into the graph, animated by its timeline. Wire it into *Copy to Points* and your own artwork is stamped across a generative system.

**Import SVG** (File menu, or drag a `.svg` onto the graph) brings in logos and illustrations. **Draw** is a small pen editor inside a node.

Every node is described in the [node reference](node-reference.md).

### Shapes, paths and layout

- **Bezier paths:** *Curve* (two handles), *Connect* (turn on `smooth` for a flowing curve through points), *Path Points* (spread points along any shape; `degrees` follows the direction), *Resample* + *Wiggle Points* (make edges organic), *Move Points*.
- **Compound:** union, subtract, intersect or xor shapes into a single clean path, holes included. With nothing in `with`, it folds across the list: *union* merges everything, *subtract* cuts the rest out of the first.
- **Align:** line shapes up to a point (left, center, right, top, middle, bottom), as one group or each on its own.
- **Distribute:** space shapes evenly in a row or column, with a fixed gap or across a fixed length, centered where you like.

### Custom nodes

Select nodes, then press **Make custom node** (Ctrl/Cmd+G). Connections coming in become inputs.

**Open** it to edit inside: click the ◦ next to any value to show it on the custom node, click ◦ in a header to choose the output, click the name to rename. Use it again anywhere from the add-node search. Custom nodes can contain other custom nodes.

## Keyboard shortcuts

| Where | Keys |
| --- | --- |
| Everywhere | Space play/pause · Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo |
| Design | V R O Y S L P tools · Delete · Ctrl/Cmd+D duplicate · `[` `]` order · arrows nudge |
| Nodes | F fit · Delete remove · Ctrl/Cmd+G make custom node · Enter/Esc open/leave a custom node |
| Script, Code | Ctrl/Cmd+Enter run now |
