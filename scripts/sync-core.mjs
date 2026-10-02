import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generate, writeOutputs, root } from './generate.mjs';

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${response.status} fetching ${url}`);
  return response.text();
}

async function main() {
  const [mode, value, ...extra] = process.argv.slice(2);
  if (!['--version', '--from'].includes(mode) || !value || extra.length) throw Error('Usage: npm run sync:core -- --version X.Y.Z | --from ../spytial-core');
  let manifestText, schemaText;
  if (mode === '--version') {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(value)) throw Error('Supply an exact core version, not latest or a version range.');
    const base = `https://cdn.jsdelivr.net/npm/spytial-core@${value}`;
    [manifestText, schemaText] = await Promise.all([fetchText(`${base}/docs/spytial-language.json`), fetchText(`${base}/docs/spytial-spec.schema.json`)]);
    const response = await fetch(`${base}/dist/browser/spytial-core-complete.global.js`, { method: 'HEAD', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Core ${value} has no available CDN browser bundle (${response.status}).`);
    if (JSON.parse(manifestText).spytialCoreVersion !== value) throw Error('Downloaded manifest version differs from the requested version.');
  } else {
    [manifestText, schemaText] = await Promise.all(['spytial-language.json', 'spytial-spec.schema.json'].map(name => readFile(path.resolve(value, 'docs', name), 'utf8')));
    const pkg = JSON.parse(await readFile(path.resolve(value, 'package.json'), 'utf8'));
    if (JSON.parse(manifestText).spytialCoreVersion !== pkg.version) throw Error('Local manifest is stale; run npm run build:language in core first.');
  }
  // Validate and generate everything before changing any tracked files.
  const outputs = generate(manifestText, schemaText);
  const previous = JSON.parse(await readFile(path.join(root, 'vendor/core/spytial-language.json'), 'utf8')), next = JSON.parse(manifestText);
  const signatures = m => new Map(m.items.map(i => [i.yamlKey, JSON.stringify(i)]));
  const oldItems = signatures(previous), newItems = signatures(next);
  console.log(`Core ${previous.spytialCoreVersion} → ${next.spytialCoreVersion}; language ${previous.languageVersion} → ${next.languageVersion}`);
  console.log('Added:', [...newItems.keys()].filter(k => !oldItems.has(k)).join(', ') || '(none)');
  console.log('Removed:', [...oldItems.keys()].filter(k => !newItems.has(k)).join(', ') || '(none)');
  console.log('Changed:', [...newItems.keys()].filter(k => oldItems.has(k) && oldItems.get(k) !== newItems.get(k)).join(', ') || '(none)');
  await writeFile(path.join(root, 'vendor/core/spytial-language.json'), manifestText);
  await writeFile(path.join(root, 'vendor/core/spytial-spec.schema.json'), schemaText);
  await writeOutputs(outputs);
  if (mode === '--from') console.log('Local checkout mode: the runtime pin also changed. Its CDN release may not exist yet; use coreUrl/local browser checks until published.');
  console.log('Run npm test and test/browser.html; review and commit the vendor + generated diffs together.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
