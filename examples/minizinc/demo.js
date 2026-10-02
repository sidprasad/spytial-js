import { diagram, loadCore } from '../../index.js';
import { Coloring, REGIONS, PALETTE, registry, applySolution } from './data.js';
import { solveColoring, SOLUTION_LIMIT } from './solver.js';

const $ = id => document.getElementById(id);
const graph = new Coloring();
let view, source, controller, solutions = [], selected = -1, nColors = 3, rendering = false;
const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('error', error); };
function controls() {
  $('solve').disabled = !view || !source || !!controller || rendering;
  $('colors').disabled = !!controller || rendering;
  $('cancel').disabled = !controller;
  $('previous').disabled = !!controller || rendering || selected <= 0;
  $('next').disabled = !!controller || rendering || selected < 0 || selected >= solutions.length - 1;
}
function assignment() {
  $('assignment').replaceChildren(...REGIONS.map(name => {
    const row = document.createElement('tr');
    for (const value of [name, graph[name].color]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    return row;
  }));
}
async function show(index) {
  rendering = true; controls();
  try {
    const spec = applySolution(graph, solutions[index], nColors);
    await view.update(graph, { spec });
    selected = index;
    assignment();
    $('position').textContent = `Solution ${index + 1} of ${solutions.length}`;
    $('solution').textContent = JSON.stringify({ color: solutions[index] }, null, 2);
  } finally { rendering = false; controls(); }
}
async function clear() {
  solutions = []; selected = -1;
  for (const name of REGIONS) graph[name].color = 'Unassigned';
  assignment();
  $('position').textContent = 'No solution selected';
  $('solution').textContent = 'No solution yet.';
  await view.update(graph, { spec: [] });
}
$('solve').onclick = async () => {
  controller = new AbortController(); controls();
  nColors = Number($('colors').value);
  try {
    await clear();
    const result = await solveColoring(source, nColors, { signal: controller.signal, onPhase: status });
    solutions = result.solutions;
    if (solutions.length) {
      await show(0);
      const complete = result.status === 'ALL_SOLUTIONS';
      status(`${solutions.length} solution${solutions.length === 1 ? '' : 's'} found with ${nColors} colors.${complete ? ' All solutions collected.' : solutions.length === SOLUTION_LIMIT ? ' Showing the first 24.' : ' Search stopped before enumeration completed.'} Browse the assignments below.`);
    } else if (result.status === 'UNSATISFIABLE') {
      status(`No solution with ${nColors} colors. WA, NT, and SA all share borders with each other, so they need three different colors.`);
    } else status(`No solution found. Solver status: ${result.status}. Try again.`, true);
  } catch (error) {
    status(controller.signal.aborted ? 'Cancelled. You can start another solve.' : (error.message ?? JSON.stringify(error)), !controller.signal.aborted);
  } finally { controller = null; controls(); }
};
$('cancel').onclick = () => controller?.abort();
$('previous').onclick = () => show(selected - 1).catch(error => status(error.message, true));
$('next').onclick = () => show(selected + 1).catch(error => status(error.message, true));
$('colors').onchange = () => status(`Choose Solve map to run with ${$('colors').value} colors. The table shows the last solved assignment.`);
window.addEventListener('pagehide', () => { controller?.abort(); view?.dispose(); });

try {
  for (const swatch of PALETTE) {
    const item = document.createElement('span'), dot = document.createElement('span');
    dot.className = 'swatch'; dot.style.background = swatch.color;
    item.append(dot, swatch.name); $('legend').append(item);
  }
  assignment();
  const local = new URL(location.href).searchParams.get('core') === 'local';
  const [core, response] = await Promise.all([
    loadCore(local ? { coreUrl: '/spytial-core/dist/browser/spytial-core-complete.global.js' } : {}),
    fetch('./model.mzn'),
  ]);
  if (!response.ok) throw new Error(`Could not load the MiniZinc model (${response.status}).`);
  source = await response.text(); $('model').textContent = source;
  view = await diagram('#diagram', graph, { core, registry, height: 490, label: 'Map coloring solution' });
  status('Ready. Solve with three colors, or try two to find an impossible case.');
  controls();
  // Read-only inspection seam used by the real browser regression harness.
  window.minizincDemo = { graph, view, get solutions() { return solutions; }, get selected() { return selected; } };
} catch (error) { status(error.message, true); }
