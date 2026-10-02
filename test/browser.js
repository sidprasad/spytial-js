import { spytial, orientation, attribute, diagram, loadCore, relationalize, composeSpec, createRegistry } from '../index.js';
const output = document.querySelector('#results');
let passed = 0, failed = 0;
const assert = (ok, message) => { if (!ok) throw Error(message); };
async function check(name, fn) {
  const li = document.createElement('li'); output.append(li);
  try { await fn(); li.textContent = `PASS: ${name}`; li.className = 'pass'; passed++; }
  catch (e) { li.textContent = `FAIL: ${name}: ${e.message}`; li.className = 'fail'; failed++; console.error(e); }
}
const fixture = () => { const el = document.createElement('div'); document.querySelector('#fixtures').append(el); return el; };
try {
  const local = new URL(location.href).searchParams.get('core') === 'local';
  const core = await loadCore(local ? { coreUrl: '/spytial-core/dist/browser/spytial-core-complete.global.js' } : {});
  await check('canonical data and automatic scalar attributes work with the real evaluator', () => {
    const snapshot = relationalize({ age: 42, friend: { age: 7 } });
    const instance = new core.JSONDataInstance(snapshot.data);
    const evaluator = new core.SGraphQueryEvaluator(); evaluator.initialize({ sourceData: instance });
    const result = new core.LayoutInstance(core.parseLayoutSpec(composeSpec(snapshot)), evaluator).generateLayout(instance);
    assert(!result.error && !result.selectorErrors.length && !result.warnings.length, 'unexpected core diagnostics');
    assert(result.layout.nodes.length === 2, 'primitive nodes were not folded into attributes');
  });
  await check('reserved property names and mixed scalar/reference fields retain their meaning', async () => {
    const source = { set: 1, open: 2, JSScalar: 3, items: [{ value: 7 }, { value: { name: 'child' } }] };
    const view = await diagram(fixture(), source, { core });
    assert(!view.result.error && !view.result.selectorErrors.length && !view.result.warnings.length, 'selector encoding failed');
    assert(view.result.layout.nodes.length === 7, 'compact presentation dropped a structural object');
    view.dispose();
  });
  const target = fixture(); target.append(document.createTextNode('Host content survives'));
  const value = { count: 1 }, view = await diagram(target, value, { core, height: 280 });
  await check('mounted inline with compact controls and rendered SVG', () => {
    assert(target.textContent.includes('Host content survives'), 'host contents replaced');
    assert(view.element.shadowRoot?.querySelector('svg') || view.element.querySelector('svg'), 'no SVG');
    assert(view.element.getViewOptions().toolbar === 'compact', 'wrong toolbar');
    assert(!view.element.getViewOptions().interaction.structuralEditing, 'editing enabled');
    assert(view.diagnostics.length === 0, 'unexpected diagnostics');
  });
  await check('explicit updates preserve IDs and capture queued calls immediately', async () => {
    const id = view.snapshot.rootId;
    value.count = 2; const first = view.update();
    value.count = 3; const second = view.update();
    value.count = 99;
    await first; await second;
    assert(view.snapshot.rootId === id, 'identity changed');
    assert(view.snapshot.data.atoms.some(a => a.label === '3'), 'second call was not captured');
    assert(!view.snapshot.data.atoms.some(a => a.label === '99'), 'captured a later mutation');
  });
  await check('parse failures reject, preserve the prior snapshot, and permit recovery', async () => {
    const before = view.snapshot;
    let rejected = false;
    try { await view.update(value, { spec: 'constraints: [' }); } catch { rejected = true; }
    assert(rejected && view.snapshot === before, 'failed update replaced snapshot');
    assert(view.diagnostics.length > 0, 'parse error hidden');
    await view.update(value, { spec: {} });
    assert(view.diagnostics.length === 0, 'diagnostics not cleared');
  });
  await check('constraint conflicts are surfaced alongside the core fallback diagram', async () => {
    const cycle = {}; cycle.next = cycle;
    const conflicted = await diagram(fixture(), cycle, { core, spec: { constraints: [{ orientation: { selector: 'next', directions: ['above'] } }] } });
    assert(conflicted.diagnostics.some(d => d.phase === 'constraints'), 'conflict hidden');
    conflicted.dispose();
  });
  await check('class rules constrain a real binary-tree layout', async () => {
    class Tree {
      static [spytial] = [orientation('left', ['below', 'left']), attribute('value')];
      constructor(value, left) { this.value = value; if (left) this.left = left; }
    }
    const tree = await diagram(fixture(), new Tree(2, new Tree(1)), { core });
    assert(!tree.result.error && !tree.result.selectorErrors.length, 'tree rule failed');
    assert(tree.result.layout.nodes.length === 2, 'wrong tree node count');
    const pair = tree.snapshot.data.relations.find(r => r.name === 'left').tuples[0].atoms;
    const positions = tree.element.getLayoutState().positions;
    const parent = positions.find(p => p.id === pair[0]), child = positions.find(p => p.id === pair[1]);
    assert(child.x < parent.x && child.y > parent.y, 'child must be below and left of its parent');
    tree.dispose();
  });
  await check('multiple independent mounts and cleanup preserve host content', async () => {
    const other = await diagram(target, { other: 8 }, { core });
    view.dispose(); view.dispose();
    assert(target.querySelectorAll('webcola-cnd-graph').length === 1, 'removed another mount');
    assert(target.textContent.includes('Host content survives'), 'removed host contents');
    let rejected = false; try { await view.update(); } catch { rejected = true; }
    assert(rejected, 'disposed update accepted');
    other.dispose();
  });
  await check('dispose cancels a queued render', async () => {
    const view = await diagram(fixture(), { a: 1 }, { core });
    const pending = view.update({ a: 2 }); view.dispose();
    let rejected = false; try { await pending; } catch { rejected = true; }
    assert(rejected && !view.element.isConnected, 'disposed render survived');
  });
  await check('root scalars render and unsupported accessors produce visible diagnostics', async () => {
    const scalar = await diagram(fixture(), 7, { core });
    assert(scalar.result.layout.nodes.length === 1, 'scalar root hidden'); scalar.dispose();
    const source = Object.defineProperty({}, 'expensive', { enumerable: true, get() { throw Error('do not invoke'); } });
    const view = await diagram(fixture(), source, { core });
    assert(view.diagnostics.some(d => d.phase === 'relationalize'), 'skipped getter hidden'); view.dispose();
  });
  await check('the shipped demo buttons mutate and rerender their own views', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:900px';
    frame.src = `../examples/${local ? '?core=local' : ''}`;
    document.querySelector('#fixtures').append(frame);
    const waitFor = async predicate => {
      const deadline = Date.now() + 30000;
      while (!predicate()) {
        if (Date.now() > deadline) throw Error('demo update timed out');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    try {
      await waitFor(() => frame.contentWindow?.demo);
      const demo = frame.contentWindow.demo;
      const insert = frame.contentDocument.querySelector('#insert');
      insert.click();
      await waitFor(() => insert.textContent === 'Inserted 5');
      assert(demo.treeView.snapshot.data.atoms.filter(a => a.type === 'TreeNode').length === 7, 'new tree node missing');
      const change = frame.contentDocument.querySelector('#change');
      change.click();
      await waitFor(() => !change.disabled);
      assert(demo.stock.count === 5, 'stock not incremented');
      assert(demo.dictionaryView.snapshot.data.atoms.some(a => a.label === '5'), 'stock diagram not updated');
    } finally { frame.remove(); }
  });
} catch (error) { await check('setup', () => { throw error; }); }
document.querySelector('#summary').textContent = `${passed} passed; ${failed} failed`;
document.title = `${failed ? 'FAIL' : 'PASS'} — Spytial JS browser checks`;
