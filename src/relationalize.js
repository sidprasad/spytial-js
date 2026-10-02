import { classSpec, rulesToSpec } from './rules.js';

const scalarTypes = new Set(['JSString', 'JSNumber', 'JSBoolean', 'JSBigInt', 'JSNull', 'JSUndefined', 'JSSymbol']);
// Word tokens from simple-graph-query's ForgeLexer, plus core's built-in names.
const reserved = new Set(`open as var abstract sig extends in lone some one two set func pfunc disj wheat pred fun assert run check for but exactly none univ iden is sat unsat theorem forge_error checked test expect suite all sufficient necessary consistent inconsistent with let bind or xor iff implies else and not this sexpr inst eval example ni no sum Int option String IntRef if then`.split(' '));

/** An injective name encoding; the reserved prefix is itself escaped. */
export function selectorName(name) {
  if (typeof name !== 'string') throw new TypeError('Selector names must be strings.');
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith('js_') && !name.startsWith('JS') && !reserved.has(name)
    ? name : `js_${Array.from(name, c => c.codePointAt(0).toString(16)).join('_') || 'empty'}`;
}

const isObject = value => value !== null && (typeof value === 'object' || typeof value === 'function');

function constructorOf(value) {
  const proto = Object.getPrototypeOf(value);
  return proto && Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
}

/** Registries are local to a view/application, never attached to user objects. */
export function createRegistry() {
  const classes = new WeakMap();
  const values = new WeakMap();
  function descriptor(config) {
    if (!config || typeof config !== 'object') throw new TypeError('Expected a descriptor.');
    if (config.kind && !['record', 'dictionary'].includes(config.kind)) throw new TypeError('kind must be record or dictionary.');
    if (config.type !== undefined && (typeof config.type !== 'string' || !config.type)) throw new TypeError('type must be a nonempty string.');
    for (const key of ['fields', 'label']) {
      if (config[key] !== undefined && typeof config[key] !== 'function') throw new TypeError(`${key} must be a function.`);
    }
    if (config.fields && config.kind === 'dictionary') throw new TypeError('Use fields for records or kind: dictionary, not both.');
    // Spec values are JSON, not functions or YAML fragments. YAML is a per-call escape hatch.
    const spec = config.spec === undefined ? undefined : copySpec(config.spec);
    return Object.freeze({ ...config, spec });
  }
  return {
    type(ctor, config) {
      if (typeof ctor !== 'function') throw new TypeError('Expected a constructor.');
      classes.set(ctor, descriptor(config));
      return this;
    },
    value(value, config) {
      if (!isObject(value)) throw new TypeError('Value descriptors require an object.');
      values.set(value, descriptor(config));
      return this;
    },
    resolve(value) { return values.get(value) ?? classes.get(constructorOf(value)); },
  };
}

export function copySpec(spec) {
  if (Array.isArray(spec)) return rulesToSpec(spec);
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError('Expected a spec object with constraints/directives arrays.');
  for (const key of Object.keys(spec)) {
    if (!['constraints', 'directives'].includes(key) || !Array.isArray(spec[key])) throw new TypeError(`Invalid spec section: ${key}`);
  }
  return JSON.parse(JSON.stringify(spec));
}

/** Reuse a relationalizer across updates to retain reference-based IDs. */
export function createRelationalizer({ registry = createRegistry(), identity, maxAtoms = 1000, maxTuples = 5000 } = {}) {
  for (const [key, value] of Object.entries({ maxAtoms, maxTuples })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive integer.`);
  }
  if (identity !== undefined && typeof identity !== 'function') throw new TypeError('identity must be a function.');
  let nextId = 0;
  const objects = new WeakMap();
  const classNames = new WeakMap();
  const usedTypes = new Set([...scalarTypes, 'JSScalar', 'JSValue', 'JSObject', 'JSArray', 'JSMap', 'JSSet', 'JSDate', 'JSOpaque', 'JSEntry', 'JSSlot']);

  function objectId(value) {
    const supplied = identity?.(value);
    if (supplied !== undefined && supplied !== null) {
      if (!['string', 'number', 'bigint'].includes(typeof supplied) || (typeof supplied === 'number' && !Number.isFinite(supplied))) {
        throw new TypeError('identity must return a string, finite number, bigint, null, or undefined.');
      }
      return `user:${typeof supplied}:${String(supplied)}`;
    }
    if (!objects.has(value)) objects.set(value, `object:${++nextId}`);
    return objects.get(value);
  }

  function objectType(value, config) {
    if (config?.type) {
      if (config.type.startsWith('JS')) throw new TypeError('Type names beginning with JS are reserved for the integration.');
      const type = selectorName(config.type);
      usedTypes.add(type);
      return type;
    }
    if (config?.kind === 'dictionary') return 'JSObject';
    if (Array.isArray(value)) return 'JSArray';
    if (value instanceof Map) return 'JSMap';
    if (value instanceof Set) return 'JSSet';
    if (value instanceof Date) return 'JSDate';
    const ctor = constructorOf(value);
    if (typeof ctor !== 'function' || ctor === Object) return 'JSObject';
    if (!classNames.has(ctor)) {
      const base = selectorName(Object.getOwnPropertyDescriptor(ctor, 'name')?.value || 'Anonymous');
      let name = base;
      let suffix = 1;
      while (usedTypes.has(name) || name.startsWith('JS')) name = `Type_${base}_${suffix++}`;
      usedTypes.add(name);
      classNames.set(ctor, name);
    }
    return classNames.get(ctor);
  }

  return function relationalize(root) {
    const atoms = new Map(), relations = new Map(), owners = new Map(), symbols = new Map();
    const queue = [], warnings = [], specs = [], seenSpecs = new Set(), seenClasses = new Set(), scalarFields = new Set();
    const fieldNames = new Map();
    let tuples = 0;
    function addAtom(id, type, label) {
      if (!atoms.has(id)) {
        if (atoms.size >= maxAtoms) throw new RangeError(`Diagram exceeds maxAtoms (${maxAtoms}). Select a smaller root or raise the limit.`);
        atoms.set(id, { id, type, label });
      }
      return id;
    }
    function walk(value) {
      if (!isObject(value)) {
        let type, label;
        if (value === null) { type = 'JSNull'; label = 'null'; }
        else if (value === undefined) { type = 'JSUndefined'; label = 'undefined'; }
        else {
          type = { string: 'JSString', number: 'JSNumber', boolean: 'JSBoolean', bigint: 'JSBigInt', symbol: 'JSSymbol' }[typeof value];
          label = typeof value === 'string' ? JSON.stringify(value) : Object.is(value, -0) ? '-0' : String(value);
          if (typeof value === 'bigint') label += 'n';
        }
        // Symbols with identical descriptions are distinct values.
        if (typeof value === 'symbol') {
          if (!symbols.has(value)) symbols.set(value, `symbol:${++nextId}`);
          return addAtom(symbols.get(value), type, label);
        }
        return addAtom(`scalar:${type}:${label}`, type, label);
      }
      const id = objectId(value);
      if (owners.has(id)) {
        if (owners.get(id) !== value) throw new Error(`Duplicate identity ${id}: distinct objects must not share an ID within one snapshot.`);
        return id;
      }
      owners.set(id, value); // Claim before walking fields: cycles and aliases stay faithful.
      const config = registry.resolve(value);
      const type = objectType(value, config);
      const label = config?.label ? String(config.label(value)) : type;
      addAtom(id, type, label);
      const ctor = constructorOf(value);
      if (!seenClasses.has(ctor)) {
        seenClasses.add(ctor);
        const attached = classSpec(ctor);
        if (attached) specs.push(attached);
      }
      if (config?.spec && !seenSpecs.has(config)) { specs.push(config.spec); seenSpecs.add(config); }
      queue.push({ value, id, config });
      return id;
    }
    function relation(name) {
      const safe = selectorName(name);
      fieldNames.set(name, safe);
      if (!relations.has(safe)) relations.set(safe, { id: safe, name: safe, types: ['JSValue', 'JSValue'], tuples: [] });
      return relations.get(safe);
    }
    function edge(name, from, to) {
      if (++tuples > maxTuples) throw new RangeError(`Diagram exceeds maxTuples (${maxTuples}). Select a smaller root or raise the limit.`);
      relation(name).tuples.push({ atoms: [from, to], types: ['JSValue', 'JSValue'] });
      if (scalarTypes.has(atoms.get(to).type)) scalarFields.add(selectorName(name));
    }
    function fields(value, id, declare = true) {
      const result = [];
      // Descriptors avoid invoking getters. Proxies can still run traps; see DESIGN.md.
      for (const key of Reflect.ownKeys(value)) {
        const d = Object.getOwnPropertyDescriptor(value, key);
        if (!d?.enumerable) continue;
        if (typeof key === 'symbol') { warnings.push({ code: 'symbol-key', atomId: id, message: `Skipped symbol-keyed property ${String(key)}.` }); continue; }
        if (declare) relation(key); // Empty record fields remain available to selectors.
        if (!('value' in d)) { warnings.push({ code: 'accessor', atomId: id, message: `Skipped accessor ${key}; supply a fields adapter to evaluate it explicitly.` }); continue; }
        result.push([key, d.value]);
      }
      return result;
    }
    const rootId = walk(root);
    for (let i = 0; i < queue.length; i++) {
      const { value, id, config } = queue[i];
      if (config?.fields) {
        const projected = config.fields(value);
        if (!projected || typeof projected !== 'object' || Array.isArray(projected)) throw new TypeError('fields must return an object of named fields.');
        for (const [name, child] of fields(projected, id)) edge(name, id, walk(child));
      } else if (config?.kind === 'dictionary' || value instanceof Map) {
        const entries = value instanceof Map ? Array.from(Map.prototype.entries.call(value)) : fields(value, id, false);
        relation('entry'); relation('key'); relation('value');
        for (const [key, child] of entries) {
          const keyId = walk(key);
          const entryId = addAtom(`entry:${JSON.stringify([id, keyId])}`, 'JSEntry', 'Entry');
          edge('entry', id, entryId); edge('key', entryId, keyId); edge('value', entryId, walk(child));
        }
      } else if (Array.isArray(value) && config?.kind !== 'record') {
        relation('item'); relation('index'); relation('value'); relation('next');
        let previous;
        for (const [key, child] of fields(value, id, false)) {
          if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= 2 ** 32 - 1) { edge(key, id, walk(child)); continue; }
          const slot = addAtom(`slot:${JSON.stringify([id, key])}`, 'JSSlot', `[${key}]`);
          edge('item', id, slot); edge('index', slot, walk(Number(key))); edge('value', slot, walk(child));
          if (previous) edge('next', previous, slot);
          previous = slot;
        }
        edge('length', id, walk(value.length));
      } else if (value instanceof Set && config?.kind !== 'record') {
        relation('member');
        for (const child of Array.from(Set.prototype.values.call(value))) edge('member', id, walk(child));
      } else if (value instanceof Date && config?.kind !== 'record') {
        const time = Date.prototype.getTime.call(value);
        edge('iso', id, walk(Number.isNaN(time) ? 'Invalid Date' : Date.prototype.toISOString.call(value)));
      } else if (typeof value === 'function' || value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise || (typeof Node !== 'undefined' && value instanceof Node)) {
        warnings.push({ code: 'opaque', atomId: id, message: `${atoms.get(id).type} is opaque; supply a fields adapter to expose its data.` });
      } else {
        for (const [name, child] of fields(value, id)) edge(name, id, walk(child));
      }
    }
    const types = new Map();
    for (const atom of atoms.values()) {
      if (!types.has(atom.type)) types.set(atom.type, {
        id: atom.type, types: scalarTypes.has(atom.type) ? [atom.type, 'JSScalar', 'JSValue'] : [atom.type, 'JSValue'],
        atoms: [], isBuiltin: scalarTypes.has(atom.type),
      });
      types.get(atom.type).atoms.push(atom);
    }
    return {
      data: { atoms: [...atoms.values()], relations: [...relations.values()], types: [...types.values()] },
      rootId, warnings, specs: specs.map(copySpec), fieldNames: Object.fromEntries(fieldNames),
      defaultSpec: {
        constraints: [],
        directives: [
          ...[...scalarFields].map(field => ({ attribute: { field, filter: `${field} & (univ -> JSScalar)` } })),
          ...(isObject(root) ? [{ flag: 'hideDisconnectedBuiltIns' }] : []),
        ],
      },
    };
  };
}

export function relationalize(value, options) { return createRelationalizer(options)(value); }

/** Object specs compose; raw YAML deliberately replaces the entire composition. */
export function composeSpec(snapshot, { spec, inheritRules = true, presentation = 'compact' } = {}) {
  if (!['compact', 'graph'].includes(presentation)) throw new TypeError('presentation must be compact or graph.');
  if (typeof spec === 'string') return spec;
  const fragments = [
    ...(presentation === 'compact' ? [snapshot.defaultSpec] : []),
    ...(inheritRules ? snapshot.specs : []),
    ...(spec === undefined ? [] : [copySpec(spec)]),
  ];
  return JSON.stringify({
    constraints: fragments.flatMap(s => s.constraints ?? []),
    directives: fragments.flatMap(s => s.directives ?? []),
  });
}
