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

## Examples

**Examples → Code** has 61 sketches grouped by learning topic: color, control, forms, input, math, structure, transform, typography, cellular automata, drawing, fractals, interaction, motion, simulation and vectors. They are original programs written for Loom. They are *not* copies of the Processing examples, which are under a different license.

## Not supported (yet)

3D, cameras, lights, images and pixel arrays, file input/output, `createGraphics`, and Java-mode classes (plain JavaScript classes work fine).

## Differences from Processing

- It is JavaScript: `let` / `const` instead of types, `Math.floor` or `floor`, arrays are `[]`.
- Colors are CSS strings internally, so `color(...)` gives a string you can pass to `fill`, `stroke`, `lerpColor`.
- `mouseIsPressed` is the variable; `mousePressed()` is the event function (Processing uses `mousePressed` for both).
- Your code runs in the page. Only run sketches you trust.

The implementation is in `app/src/sketch.js`.
