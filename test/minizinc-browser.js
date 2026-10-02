import { REGIONS, BORDERS, PALETTE, validateSolution } from '../examples/minizinc/data.js';
const frame = document.createElement('iframe');
const local = new URL(location.href).searchParams.get('core') === 'local';
frame.src = `../examples/minizinc/${local ? '?core=local' : ''}`;
document.body.append(frame);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const waitFor = async predicate => {
  const deadline = Date.now() + 120000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${frame.contentDocument?.querySelector('#status')?.textContent}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
let passed = 0, failed = 0;
async function check(name, fn) {
  const li = document.createElement('li'); document.querySelector('#results').append(li);
  try { await fn(); li.textContent = `PASS: ${name}`; li.className = 'pass'; passed++; }
  catch (error) { li.textContent = `FAIL: ${name}: ${error.message}`; li.className = 'fail'; failed++; console.error(error); }
}
try {
  await waitFor(() => frame.contentWindow?.minizincDemo);
  const demo = frame.contentWindow.minizincDemo;
  const $ = id => frame.contentDocument.getElementById(id);
  const run = async n => {
    $('colors').value = String(n); $('solve').click();
    await waitFor(() => !$('solve').disabled);
  };
  const ids = () => demo.view.snapshot.data.atoms.filter(atom => atom.type === 'Region').map(atom => atom.id).join(',');
  const initialIds = ids();
  await check('real Gecode finds valid three-color solutions and renders seven regions / nine borders', async () => {
    await run(3);
    assert(demo.solutions.length === 2, `expected two symmetry-reduced solutions; ${$('status').textContent}`);
    for (const solution of demo.solutions) validateSolution(solution, 3);
    assert(demo.view.diagnostics.length === 0, JSON.stringify(demo.view.diagnostics));
    assert(demo.view.result.layout.nodes.length === 7, 'container/scalar nodes leaked');
    // Core also returns invisible layout-support edges for disconnected atoms.
    const borders = demo.view.result.layout.edges.filter(edge => edge.relationName === 'border');
    const pairs = borders.map(edge => `${edge.source.label}-${edge.target.label}`).sort();
    const expected = BORDERS.map(([a, b]) => `${REGIONS[a - 1]}-${REGIONS[b - 1]}`).sort();
    assert(JSON.stringify(pairs) === JSON.stringify(expected), 'border endpoints do not match the model');
    assert(ids() === initialIds, 'region IDs changed');
    // Read the actual SVG fills as well as the table, not only the source spec.
    const root = demo.view.element.shadowRoot ?? demo.view.element;
    const fills = [...root.querySelectorAll('svg [fill]')].map(el => el.getAttribute('fill').toLowerCase());
    for (const swatch of PALETTE.slice(0, 3)) assert(fills.includes(swatch.color), `missing rendered ${swatch.name} fill`);
  });
  await check('next and previous update the visible assignment while preserving identity', async () => {
    const first = $('assignment').textContent;
    $('next').click(); await waitFor(() => demo.selected === 1 && !$('previous').disabled);
    assert($('assignment').textContent !== first, 'assignment did not change');
    assert(ids() === initialIds, 'browsing changed IDs');
    $('previous').click(); await waitFor(() => demo.selected === 0 && !$('next').disabled);
    assert($('assignment').textContent === first, 'previous did not restore assignment');
  });
  await check('two colors is unsatisfiable and clears the preceding solution', async () => {
    await run(2);
    assert($('status').textContent.includes('No solution with 2 colors'), $('status').textContent);
    assert(demo.solutions.length === 0 && demo.selected === -1, 'stale solution retained');
    assert(REGIONS.every(name => demo.graph[name].color === 'Unassigned'), 'old colors retained');
    assert($('next').disabled && $('previous').disabled, 'stale paging enabled');
  });
  await check('cancellation permits another solve and four-color enumeration is bounded', async () => {
    $('solve').click(); $('cancel').click();
    await waitFor(() => !$('solve').disabled);
    assert($('status').textContent.startsWith('Cancelled'), $('status').textContent);
    await run(4);
    assert(demo.solutions.length === 24, $('status').textContent);
    for (const solution of demo.solutions) validateSolution(solution, 4);
    assert(demo.view.diagnostics.length === 0, 'unexpected layout diagnostics');
  });
} catch (error) { await check('setup', () => { throw error; }); }
document.querySelector('#summary').textContent = `${passed} passed; ${failed} failed`;
document.title = `${failed ? 'FAIL' : 'PASS'} — MiniZinc browser checks`;
