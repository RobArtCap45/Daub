# The Script language

The **Script** tab shows your node graph as text. Edit the text and the graph updates (a moment after you stop typing). Edit the graph and the text follows when you come back to the tab. Errors name the line and often suggest a fix; click the message to jump to the line.

```
// Pipe a value into the next node with |>. Name a value with "let" to reuse it.
let pts = grid(14, 14, 460, 460)
let n = noiseField(pts, scale: 0.004, time: time(0.3))

star(5, 22, 10)
  |> copy(pts, scale: n * 2.2, rotate: n * 720)     // math is plain: + - * / % ^
  |> style(hue: n * 300, sat: 70, alpha: 0.95)
  |> output(bri: 6)
```

## The parts

**Calling a node** works like calling a function. Every node is a function; see the [node reference](node-reference.md) for names and inputs.

- `rect(70, 110, 10)` fills inputs in order (width, height, round).
- `grid(14, 14, width: 460, height: 460)` mixes positions and names. `name: value` sets one input by name, in any order.
- Choices are plain words: `compound(op: subtract)`, `align(halign: left)`. Quoted text works too.

**Pipes.** `x |> f(...)` passes `x` into the next node. It goes into the **first input of `f` that accepts its kind** (shapes into a shape input, points into a points input, numbers into a number input) **and has not been given by name**. Then positional values fill the remaining inputs in order.

```
grid(5, 5) |> copy(rect(8, 8))
```

`grid(5, 5)` makes points, so they go into `copy`'s *points* input; `rect(8, 8)` fills the first remaining input, *shape*.

**Names.** `let size = 40` names a value. Naming a node's result lets several places use the same node, so it is only computed once.

**Math.** `+ - * / % ^` and brackets, with the usual order of operations. `n * 360 + 20` becomes math nodes. Math on plain numbers is calculated straight away. Lists work too: `n * 360` multiplies every item.

**Comments** start with `//` (or `#`). Lines can end with `;`. A line that starts with `|>` continues the line above.

**The last line** should make shapes. If it does not end with `output(...)`, one is added for you. A script can only have one output.

## Your own nodes

```
def petals(count = 12, radius = 60, hue = 0) {
  let spots = ring(count, radius)
  ellipse(70, 22)
    |> copy(spots, rotate: attribute(spots, degrees))
    |> style(hue: hue, sat: 55, alpha: 0.3)
}

merge(petals(12, 50), petals(18, 110, 200))
  |> output(bri: 8)
```

`def` makes a custom node. Its **parameters become its controls** (with the defaults you give them). The last line of the body is what it returns. In the Nodes tab it appears as a custom node you can open and edit. A short form works for one-liners: `def double(n = 1) = n * 2`.

## Imported SVGs and drawn paths

These hold data that cannot be written as text, so they appear with an id: `svg(id: "n3", size: 300)` and `draw(id: "n5")`. Keep the `id` and the data is kept. Remove the line and the data is gone (use Undo in the Nodes tab to get it back).

## Tidy

The **Tidy** button rewrites your script in its standard form: it turns your text into a graph and back again. Short names, positional values for the leading dimensions of shapes, named values for everything else, and long chains split across lines.

## Errors

| You wrote | You see |
| --- | --- |
| `cpoy(...)` | `I don't know a node called “cpoy”. Did you mean “copy”?` |
| `grid(colz: 3)` | `“grid” has no input called “colz”. Did you mean “cols”? …` |
| `rect(1,1) \|> copy(...)` where points are needed | `copy's “pts” needs points, but this is shapes.` |
| a lone value on a line | `This line makes a value, but nothing uses it.` |

## Grammar

```
program    = { statement }
statement  = "let" name "=" pipe
           | "def" name "(" [ param { "," param } ] ")" ( "=" pipe | "{" { statement } "}" )
           | pipe
param      = name [ "=" unary ]
pipe       = sum { "|>" call }
sum        = product { ("+" | "-") product }
product    = unary { ("*" | "/" | "%") unary }
unary      = "-" unary | power
power      = atom [ "^" unary ]
atom       = number | string | name | call | "(" pipe ")"
call       = name [ "(" [ arg { "," arg } ] ")" ]
arg        = [ name ":" ] pipe
```

## Notes for contributors

- The compiler and the decompiler share one rule for where a piped value goes (`matchInput` in `app/src/script.js`). If you change it, change both sides; `tests/script.test.js` round-trips every built-in example through text and back and compares the drawings.
- The text format is a view of the project JSON described in [architecture](architecture.md), not a separate file format.
