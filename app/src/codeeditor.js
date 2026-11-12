/* The node editor, set up for code: every node is one statement and the wires say what runs next.
 * (The editor itself is in editor.js; the parser and the code writer are in codegraph.js.)
 *
 * - A statement runs after the one wired into its "after" port. The Start node begins each block.
 * - A statement that is not wired to Start does not run, and is shown dimmed.
 * - Loops, ifs and functions have an Open button: their body is a graph of its own.
 */
(function (g) {
  'use strict';
  const { Editor, codegraph: cg } = g.Daub;

  class CodeEditor extends Editor {
    constructor(host, project, onChange) { super(host, project, onChange); host.classList.add('codeg'); }
    get codeMode() { return true; }
    def(type) { return cg.getDef(type); }

    allGraphs() { return [this.project, ...Object.values(this.subs)]; }
    newId() { // ids are unique across the whole program, because a container's body is stored under its id
      const ids = this.allGraphs().flatMap((q) => q.nodes.map((n) => parseInt(String(n.id).replace(/\D/g, ''), 10) || 0));
      return 'n' + (Math.max(0, ...ids) + 1);
    }
    reachable(gph = this.graph) { // ids of the statements that are wired up from Start
      const next = new Map(); for (const e of gph.edges) if (e.input === 'flow' && !next.has(e.from)) next.set(e.from, e.to);
      const seen = new Set(['start']); for (let id = next.get('start'); id && !seen.has(id); id = next.get(id)) seen.add(id);
      return seen;
    }
    rebuild() { this.reach = this.reachable(); super.rebuild(); }
    buildNode(n, connected) {
      const box = super.buildNode(n, connected);
      if (!this.reach.has(n.id)) { box.classList.add('off'); box.title = 'Not wired to Start, so it does not run'; }
      return box;
    }
    titleOf(id) { for (const gph of this.allGraphs()) { const n = gph.nodes.find((q) => q.id === id); if (n) return cg.nodeTitle(n); } return 'inside'; }

    // a new node goes in right after the selected one, or at the end of the block
    addNode(type, wx, wy) {
      const gph = this.graph, id = this.newId(), reach = this.reachable();
      const order = []; const next = new Map(); for (const e of gph.edges) if (e.input === 'flow' && !next.has(e.from)) next.set(e.from, e.to);
      for (let q = 'start'; q && !order.includes(q); q = next.get(q)) order.push(q);
      const picked = [...this.sel].find((q) => reach.has(q) && gph.nodes.some((n) => n.id === q) && this.def(gph.nodes.find((n) => n.id === q).type).out);
      const after = picked || order[order.length - 1];
      const anchor = gph.nodes.find((n) => n.id === after);
      const node = { id, type, x: wx ?? (anchor ? anchor.x + 300 : 20), y: wy ?? (anchor ? anchor.y : 20), params: cg.defaults(type) };
      gph.nodes.push(node);
      const link = gph.edges.find((e) => e.from === after && e.input === 'flow');
      if (link) { const old = link.to; link.to = id; gph.edges.push({ from: id, to: old, input: 'flow' }); } else gph.edges.push({ from: after, to: id, input: 'flow' });
      if (this.def(type).container) this.subs[id] = { name: cg.nodeTitle(node), nodes: [{ id: 'start', type: 'start', x: 20, y: 20, params: {} }], edges: [] };
      this.sel = new Set([id]); this.rebuild(); this.changed();
    }

    // copy the selected statements (and whatever is inside them), each wired in right after its original
    duplicateSelected() {
      const gph = this.graph, reach = this.reachable(), made = [];
      for (const n of this.selectedNodes()) {
        if (!reach.has(n.id) || n.type === 'start') continue;
        const c = cg.duplicate(this.project, gph, n.id, () => this.newId());
        if (!c) continue;
        const link = gph.edges.find((e) => e.from === n.id && e.input === 'flow');
        if (link) { const old = link.to; link.to = c.id; gph.edges.push({ from: c.id, to: old, input: 'flow' }); } else gph.edges.push({ from: n.id, to: c.id, input: 'flow' });
        made.push(c.id);
      }
      if (!made.length) return;
      this.sel = new Set(made); this.rebuild(); this.changed();
    }

    // deleting a statement closes the gap in the wires; deleting a container deletes what is inside it
    removeNodes(ids) {
      const gph = this.graph, set = new Set(ids);
      const flow = (e) => e.input === 'flow';
      const prev = (id) => { const e = gph.edges.find((q) => flow(q) && q.to === id); return e && e.from; };
      const nextOf = (id) => { const e = gph.edges.find((q) => flow(q) && q.from === id); return e && e.to; };
      const bridges = [];
      for (const id of set) {
        let p = prev(id), q = nextOf(id);
        while (p && set.has(p)) p = prev(p);
        while (q && set.has(q)) q = nextOf(q);
        if (p && q && !bridges.some((b) => b.from === p)) bridges.push({ from: p, to: q, input: 'flow' });
      }
      const drop = (id) => { const s = this.subs[id]; if (!s) return; delete this.subs[id]; s.nodes.forEach((n) => drop(n.id)); };
      ids.forEach(drop);
      super.removeNodes(ids);
      for (const b of bridges) if (!this.graph.edges.some((e) => flow(e) && (e.from === b.from || e.to === b.to))) this.graph.edges.push(b);
      this.rebuild(); this.changed();
    }

    retype(n, type) { // + / − on a call node: a new argument starts as 0
      const before = this.def(n.type).inputs.filter((s) => s.t === 'text').length;
      n.type = type;
      this.def(type).inputs.filter((s) => s.t === 'text').forEach((s, k) => { if (k >= before && n.params[s.n] === undefined) n.params[s.n] = cg.newArg(this.def(type).variadic.fn, k); });
      this.pruneEdges(); this.rebuild(); this.changed();
    }
  }

  g.Daub.CodeEditor = CodeEditor;
})(window);
