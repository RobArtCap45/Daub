# Code tab: Processing-style JavaScript

Write `setup()` and `draw()` like in Processing, in plain JavaScript. The canvas is 600 × 600 with the origin at the top-left. Click ▶ (or press Ctrl/Cmd+Enter) to run.

```js
function setup() {
  colorMode(HSB);
  noStroke();
}

function draw() {
  background(0, 0, 10);
  fill((frameCount * 2) % 360, 70, 100);
  circle(mouseX, mouseY, 40);
}
```

## What is available

- **Drawing:** `background fill stroke noFill noStroke strokeWeight strokeCap strokeJoin rect square ellipse circle arc line point triangle quad bezier`, `beginShape(mode)` with `vertex bezierVertex quadraticVertex endShape` (modes: `POINTS LINES TRIANGLES TRIANGLE_STRIP TRIANGLE_FAN QUADS QUAD_STRIP`), `text textSize textAlign textWidth`, `blendMode(ADD | MULTIPLY | SCREEN | …)`.
- **Transform:** `translate rotate scale shearX shearY applyMatrix resetMatrix push pop pushMatrix popMatrix pushStyle popStyle`.
- **Color:** `colorMode(RGB | HSB)`, `color lerpColor red green blue alpha`. In RGB mode all channels are 0–255. In HSB mode here: hue 0–360, saturation and brightness 0–100, alpha 0–1. `colorMode(mode, max1, max2, max3, maxA)` sets your own ranges.
- **Math:** `map lerp norm constrain dist mag sq random randomSeed randomGaussian noise noiseSeed radians degrees`, every `Math` function, and the constants `PI TWO_PI HALF_PI QUARTER_PI`.
- **Vectors:** `createVector(x, y)` or `new PVector(x, y)`, with `add sub mult div mag normalize setMag limit dist dot heading rotate lerp copy`, and static `PVector.add/sub/mult/div/dist/fromAngle/random2D`.
- **Time and input:** `frameCount frameRate noLoop loop redraw millis hour minute second day month year`, `mouseX mouseY pmouseX pmouseY mouseIsPressed mouseButton`, and the event functions `mousePressed mouseReleased mouseClicked mouseMoved mouseDragged keyPressed keyReleased keyTyped` with `key keyCode keyIsPressed`. **Click the canvas to give the sketch the keyboard.**

## Images and fonts

```js
let img;
function setup() {
  img = loadImage('photo.jpg');   // see the note below
  img.resize(60, 0);              // 0 keeps the proportions
  img.loadPixels();
  textFont(createFont('Courier', 10));
}
function draw() {
  const c = img.pixels[0];        // a color: use it with fill(), red(), brightness() …
  image(img, 0, 0);
}
```

- `loadImage(path)`, `createImage(w, h)`, `image(img, x, y, w, h)`.
- A picture has `width`, `height`, `pixels[]` (one color per pixel, after `loadPixels()`), `updatePixels()`, `get(x, y)`, `resize(w, h)` and `copy()`.
- `brightness(c)` joins `red green blue alpha`. `createFont(name, size)` and `textFont(font)` choose the font for `text()`.
- **A browser cannot read files from your disk**, so `loadImage()` ignores the path. It gives the picture you chose with **Load image…** above the editor (or dropped on the preview), and a built-in demo picture until you do. The picture is not saved with the sketch.

## Code as nodes

Click **Nodes** above the editor to see the same sketch as a graph. Every statement is a node and the wires say what runs next, starting from **Start**.

- Edit the nodes or the text; the other follows when you switch (and the sketch re-runs as you change a node).
- Drag a number's label left or right to change it. **+** and **−** in a call's header add and remove an argument.
- **Open** on a loop, `if` or function shows what is inside. Press Esc to go back out.
- Double-click the background to add a node. It is wired in after the selected node, or at the end. Dropping a wire on empty space does the same, right after that node.
- Drag a number on its field to change it (a click types into it). `fill`, `stroke` and `background` have a color swatch (not shown after `colorMode(HSB)`).
- Ctrl/Cmd+D duplicates the selected nodes, including what is inside a loop or function.
- Delete closes the gap in the wires. A node that is not wired to Start does not run and is shown dimmed.
- `else` and `else if` have to come right after an `if`.
- Code Daub has no node for (classes, destructuring, `switch`, …) stays as a **code** node, exactly as typed. A function passed to another call, like `list.forEach((v) => { … })`, shows as one text value.
- When you change a node, the text is rewritten in Daub's tidy layout (two-space indent, semicolons). The comments and the order of your code stay.

## Examples

**Examples → Code** has 62 sketches grouped by learning topic: color, control, forms, images, input, math, structure, transform, typography, cellular automata, drawing, fractals, interaction, motion, simulation and vectors. They are original programs written for Daub. They are *not* copies of the Processing examples, which are under a different license.

## Not supported (yet)

3D, cameras, lights, the global `pixels[]` of the canvas, `tint`, file input/output, `createGraphics`, and Java-mode classes (plain JavaScript classes work fine).

## Differences from Processing

- The canvas is always 600 × 600: `size()` and `createCanvas()` are ignored, and `width` / `height` are 600.

- It is JavaScript: `let` / `const` instead of types, `Math.floor` or `floor`, arrays are `[]`.
- Colors are CSS strings internally, so `color(...)` gives a string you can pass to `fill`, `stroke`, `lerpColor`.
- `mouseIsPressed` is the variable; `mousePressed()` is the event function (Processing uses `mousePressed` for both).
- Your code runs in the page. Only run sketches you trust.

The implementation is in `app/src/sketch.js`.
