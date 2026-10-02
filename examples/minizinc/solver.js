import { modelData, validateSolution } from './data.js';

export const MINIZINC_URL = 'https://cdn.jsdelivr.net/npm/minizinc@4.3.1/dist/minizinc.mjs';
export const SOLUTION_LIMIT = 24;

// The demo runs one solve at a time. Free both active and pooled workers on exit.
export async function solveColoring(source, nColors, { signal, onPhase = () => {} } = {}) {
  const data = modelData(nColors);
  let MiniZinc, progress, timer, abort;
  const interrupted = new Promise((_, reject) => {
    abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => reject(new Error('Solver download or execution timed out. Check your connection and try again.')), 90000);
  });
  const wait = promise => Promise.race([promise, interrupted]);
  try {
    onPhase('Loading MiniZinc and its WebAssembly solver… The first download may take a moment.');
    MiniZinc = await wait(import(MINIZINC_URL));
    await wait(MiniZinc.init({ numWorkers: 1 }));
    onPhase('Solving in your browser…');
    const model = new MiniZinc.Model();
    model.addFile('coloring.mzn', source);
    model.addJson(data);
    const solutions = [];
    progress = model.solve({ options: { solver: 'gecode', 'num-solutions': SOLUTION_LIMIT, 'time-limit': 10000 } });
    let solutionError;
    progress.on('solution', event => {
      try { solutions.push(validateSolution(event.output.json.color, nColors)); }
      catch (error) { solutionError = error; }
    });
    const result = await wait(Promise.resolve(progress));
    if (solutionError) throw solutionError;
    return { solutions, status: result.status };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    progress?.cancel();
    MiniZinc?.shutdown();
  }
}
