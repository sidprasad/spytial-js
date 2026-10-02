import { catalog } from './generated/catalog.js';

/** Class-local layout specifications; shared across copies of this module. */
export const spytial = Symbol.for('spytial-js.spec');
const ruleBrand = Symbol.for('spytial-js.rule');
const items = new Map(catalog.items.map(item => [item.yamlKey, item]));
const blocks = new Map(catalog.blocks.map(block => [block.name, block.fields]));
const isMapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new TypeError(message); };
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function validateFields(value, fields, label) {
  if (!isMapping(value)) fail(`${label} must be an options object.`);
  const known = new Map(fields.map(field => [field.name, field]));
  for (const key of Object.keys(value)) if (!known.has(key)) fail(`Unknown ${label} option: ${key}`);
  for (const field of fields) {
    const v = value[field.name], at = `${label}.${field.name}`;
    if (v === undefined) { if (field.required) fail(`Missing ${at}`); continue; }
    if (field.type === 'block') { validateFields(v, blocks.get(field.block), at); continue; }
    if (field.type === 'enum' && !field.values.includes(v)) fail(`${at} must be one of ${field.values.join(', ')}`);
    if (field.type === 'enum-list') {
      if (!Array.isArray(v) || !v.length || v.some(x => !field.values.includes(x))) fail(`${at} must be a nonempty list of ${field.values.join(', ')}`);
      for (const incompatible of field.listRules?.atMostOneOf ?? []) if (new Set(v.filter(x => incompatible.includes(x))).size > 1) fail(`Conflicting values in ${at}: ${incompatible.join(', ')}`);
      for (const [narrow, allowed] of Object.entries(field.listRules?.narrowsListTo ?? {})) if (v.includes(narrow) && v.some(x => !allowed.includes(x))) fail(`${at}: ${narrow} can only combine with ${allowed.join(', ')}`);
    }
    if (field.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${at} must be a finite number.`);
      if ((field.minimum !== undefined && v < field.minimum) || (field.maximum !== undefined && v > field.maximum) || (field.exclusiveMinimum !== undefined && v <= field.exclusiveMinimum)) fail(`${at} is outside the allowed range.`);
    }
    if (field.type === 'boolean' && typeof v !== 'boolean') fail(`${at} must be a boolean.`);
    if (['selector', 'relation', 'string', 'color', 'icon-path'].includes(field.type) && typeof v !== 'string') fail(`${at} must be a string.`);
    if (field.pattern && !new RegExp(field.pattern).test(v)) fail(`${at} has an invalid format.`);
  }
}

export function makeRule(name, args) {
  const item = items.get(name);
  if (!item) fail(`Unknown Spytial rule: ${name}`);
  let body;
  if (item.valueShape === 'scalar') {
    if (args.length !== 1) fail(`${name} expects one value.`);
    validateFields({ [item.fields[0].name]: args[0] }, item.fields, name);
    body = args[0];
  } else {
    const required = item.fields.filter(field => field.required);
    if (args.length === 1 && isMapping(args[0])) body = { ...args[0] };
    else {
      if (args.length < required.length || args.length > required.length + 1) fail(`${name} expects ${required.map(f => f.name).join(', ')} and optional options.`);
      const options = args[required.length] ?? {};
      if (!isMapping(options)) fail(`${name} options must be an object.`);
      if (required.some(f => Object.hasOwn(options, f.name))) fail(`${name}: a positional field is also present in options.`);
      body = { ...options, ...Object.fromEntries(required.map((field, i) => [field.name, args[i]])) };
    }
    const fields = [...item.fields];
    if (item.supportsHold) fields.push({ name: catalog.hold.field, type: 'enum', values: catalog.hold.values });
    if (catalog.source.supportedBy.includes(item.id)) {
      if (body.source !== undefined) validateFields(body.source, catalog.source.fields, `${name}.source`);
      fields.push({ name: 'source', type: 'source' });
    }
    validateFields(body, fields, name);
  }
  return freeze({ [ruleBrand]: true, section: item.sections[0], entry: { [item.yamlKey]: JSON.parse(JSON.stringify(body)) } });
}

export function rulesToSpec(rules) {
  if (!Array.isArray(rules)) fail('[spytial] must be an array of rule helpers.');
  const spec = { constraints: [], directives: [] };
  for (const rule of rules) {
    if (!rule || rule[ruleBrand] !== true || !Object.hasOwn(spec, rule.section)) fail('[spytial] entries must come from Spytial rule helpers.');
    spec[rule.section].push(JSON.parse(JSON.stringify(rule.entry)));
  }
  return spec;
}

/** Own static declarations only; no implicit inheritance or selector rewriting. */
export function classSpec(ctor) {
  if (typeof ctor !== 'function') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(ctor, spytial);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) fail('Use a static [spytial] field, not a getter.');
  return rulesToSpec(descriptor.value);
}
