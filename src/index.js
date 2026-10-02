import { createRelationalizer, composeSpec } from './relationalize.js';
import { CORE_VERSION } from './generated/core-version.js';
export { CORE_VERSION, LANGUAGE_VERSION } from './generated/core-version.js';
export { spytial } from './rules.js';
export * from './generated/helpers.js';
export { createRegistry, createRelationalizer, relationalize, selectorName, composeSpec } from './relationalize.js';

export const CORE_URL = `https://cdn.jsdelivr.net/npm/spytial-core@${CORE_VERSION}/dist/browser/spytial-core-complete.global.js`;
const loads = new Map();

function checkCore(core) {
  for (const name of ['JSONDataInstance', 'parseLayoutSpec', 'SGraphQueryEvaluator', 'LayoutInstance']) {
    if (typeof core?.[name] !== 'function') throw new Error(`Missing spytial-core API: ${name}. Load the complete browser bundle.`);
  }
  return core;
}

/** Explicit injection supports self-hosting, CSP, and offline development. */
export async function loadCore({ core, coreUrl = CORE_URL } = {}) {
  if (core) return checkCore(core);
  if (globalThis.spytialcore) return checkCore(globalThis.spytialcore);
  if (typeof document === 'undefined') throw new Error('Rendering requires a browser. Use relationalize() for data-only work.');
  if (!loads.has(coreUrl)) {
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(new Error(`Timed out loading spytial-core from ${coreUrl}.`)), 30000);
      function fail(error) { clearTimeout(timer); script.remove(); reject(error); }
      script.src = coreUrl;
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        try { resolve(checkCore(globalThis.spytialcore)); } catch (error) { fail(error); }
      };
      script.onerror = () => fail(new Error(`Could not load spytial-core from ${coreUrl}. Check the network or provide a self-hosted coreUrl.`));
      document.head.append(script);
    });
    loads.set(coreUrl, pending);
    pending.catch(() => loads.delete(coreUrl));
  }
  return loads.get(coreUrl);
}

function messageOf(value) {
  if (value instanceof Error) return value.message;
  return value?.message ?? value?.error?.message ?? (typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * Mount a value inline. The host owns mutation, sizing, and when to update.
 * Returns { update, dispose, element, snapshot, diagnostics, result, fit }.
 */
export async function diagram(target, value, options = {}) {
  if (typeof document === 'undefined') throw new Error('diagram() requires a browser document.');
  const container = typeof target === 'string' ? document.querySelector(target) : target;
  if (!container || container.nodeType !== 1 || !container.isConnected) throw new TypeError('Mount target must be a connected DOM element.');
  const capture = createRelationalizer(options);
  let currentValue = value;
  let settings = { ...options };
  // Capture before loading assets: an async network wait must not change the snapshot.
  const first = capture(value);
  const firstSpec = composeSpec(first, settings);
  const core = await loadCore(options);
  if (!customElements.get('webcola-cnd-graph')) throw new Error('The core bundle did not register <webcola-cnd-graph>.');
  if (!container.isConnected) throw new Error('Mount target was removed while loading spytial-core.');

  const wrapper = document.createElement('section');
  wrapper.className = 'spytial-js';
  wrapper.setAttribute('aria-label', options.label ?? 'Data structure diagram');
  const graph = document.createElement('webcola-cnd-graph');
  graph.style.width = '100%';
  graph.style.height = typeof options.height === 'number' ? `${options.height}px` : (options.height ?? '420px');
  const status = document.createElement('div');
  status.className = 'spytial-js-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.whiteSpace = 'pre-wrap';
  wrapper.append(graph, status);
  container.append(wrapper);
  let disposed = false, snapshot, result, diagnostics = [], queue = Promise.resolve();

  function publish(items) {
    diagnostics = items;
    status.textContent = items.map(item => messageOf(item.detail)).join('\n');
    status.hidden = items.length === 0;
    wrapper.dispatchEvent(new CustomEvent('spytial-diagnostics', { detail: items, bubbles: true }));
  }
  const renderError = event => publish([...diagnostics, { phase: 'render', detail: event.detail }]);
  graph.addEventListener('layout-error', renderError);
  const assertActive = () => { if (disposed) throw new Error('This diagram has been disposed.'); };

  async function render(next, specText) {
    assertActive();
    try {
      const instance = new core.JSONDataInstance(next.data);
      const spec = core.parseLayoutSpec(specText);
      const evaluator = new core.SGraphQueryEvaluator();
      evaluator.initialize({ sourceData: instance });
      const generated = new core.LayoutInstance(spec, evaluator).generateLayout(instance);
      const messages = [
        ...next.warnings.map(detail => ({ phase: 'relationalize', detail })),
        ...(generated.error ? [{ phase: 'constraints', detail: generated.error }] : []),
        ...(generated.selectorErrors ?? []).map(detail => ({ phase: 'selector', detail })),
        ...(generated.warnings ?? []).map(detail => ({ phase: 'layout', detail })),
      ];
      publish(messages);
      await graph.renderLayout(generated.layout);
      assertActive();
      snapshot = next;
      result = generated;
      return handle;
    } catch (error) {
      if (!disposed) publish([...diagnostics, { phase: 'error', detail: error }]);
      throw error;
    }
  }

  const handle = {
    element: graph,
    get snapshot() { return snapshot; },
    get result() { return result; },
    get diagnostics() { return [...diagnostics]; },
    update(...args) {
      try {
        assertActive();
        const nextValue = args.length ? args[0] : currentValue;
        const overrides = args[1] ?? {};
        for (const key of Object.keys(overrides)) {
          if (!['spec', 'inheritRules', 'presentation'].includes(key)) throw new TypeError(`Cannot update option ${key}; use element APIs or mount a new diagram.`);
        }
        const nextSettings = { ...settings, ...overrides };
        const next = capture(nextValue);
        const specText = composeSpec(next, nextSettings);
        currentValue = nextValue;
        settings = nextSettings;
        // Serialize renderer calls; each captures data immediately, even if its render waits.
        queue = queue.catch(() => {}).then(() => render(next, specText));
        return queue;
      } catch (error) {
        if (!disposed) publish([{ phase: 'relationalize', detail: error }]);
        return Promise.reject(error);
      }
    },
    fit() { assertActive(); graph.resetViewToFitContent(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      graph.removeEventListener('layout-error', renderError);
      graph.dispose?.();
      wrapper.remove();
      currentValue = undefined;
      snapshot = undefined;
      result = undefined;
    },
  };
  try {
    await graph.setViewOptions({ toolbar: 'compact', ...options.view, interaction: { ...options.view?.interaction, structuralEditing: false } });
    if (options.theme) graph.setTheme(options.theme);
    await render(first, firstSpec);
    return handle;
  } catch (error) {
    handle.dispose();
    throw error;
  }
}
