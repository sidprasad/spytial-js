# Spytial for client-side JavaScript

Visualize live JavaScript objects inside an existing page. No bundler, framework,
server-side conversion, or object mutation is required. The adapter loads the
**published `spytial-core@6.5.1` CDN bundle** on first render. Layout, selectors,
constraints, dragging, and rendering remain owned by core.

This is a local integration prototype, not a published npm/CDN package. Serve
this directory as static files; its native ES modules can also be hosted on a
CDN unchanged. No imaginary `spytial-js` package URL is required.

## Run the examples

From this directory:

```sh
npm run serve
# Open http://127.0.0.1:8088/examples/
```

The demo includes a binary search tree with insertion, a dictionary with shared
values, and a cyclic structure containing arrays, a Map, and a Set. An internet
connection is needed for the default core CDN load. Serve over HTTP rather than
opening `file://` URLs, because this integration uses browser modules.

## Smallest embedding

```html
<div id="diagram"></div>
<script type="module">
  import { diagram } from './index.js';

  const state = { name: 'root', child: { value: 7 } };
  const view = await diagram('#diagram', state);

  state.child.value = 8;
  await view.update();
  // On page/component teardown: view.dispose();
</script>
```

`diagram` appends one owned section to the chosen element and preserves existing
content. You may mount several independent diagrams in the same page or target.
The default height is 420px and width is 100%. The graph has compact zoom/fit
controls and supports constrained dragging. Dragging changes the view, never the
JavaScript values. Scalar fields appear as attributes by default.

## Attach rules directly to a class

Import `spytial`, a symbol, and put rule helpers in a static field. No registry,
transpiler, decorator plugin, or custom script loader is needed.

```js
import { spytial, orientation, attribute, diagram } from './index.js';

class TreeNode {
  static [spytial] = [
    orientation("left", ["below", "left"]),
    orientation("right", ["below", "right"]),
    attribute("value"),
  ];

  constructor(value, left, right) {
    this.value = value;
    if (left) this.left = left;
    if (right) this.right = right;
  }
}

const root = new TreeNode(2, new TreeNode(1), new TreeNode(3));
const view = await diagram('#diagram', root);
```

The walker discovers the class specification automatically, including classes
nested inside arrays, maps, or other objects. Each constructor contributes once
per capture. Static metadata is not relationalized as application data.

**Selectors are passed through unchanged.** Attaching `orientation("left", ...)`
to `TreeNode` does not restrict `left` to that type. Write a restriction yourself
only when you want one. Directions describe the target relative to the source;
`left(parent, child)` with `below, left` places the child below and left of parent.
This example omits absent children. If your objects keep null children, retain
that data and explicitly filter the selector, e.g. `left & (TreeNode -> TreeNode)`.

Helpers accept an options object as well as positional shortcuts:

```js
orientation({ selector: 'left', directions: ['below', 'left'] });
attribute('value', { textStyle: { color: '#205b40' } });
orientation('left', ['below'], {
  hold: 'never',
  source: { text: 'Never place a left child below its parent', location: 'tree.js:12' },
});
```

The [generated helper reference](docs/rule-helpers.md) covers the full core
vocabulary. Helpers check required fields, names, enums, numeric bounds, nested
style blocks, and contradictory directions. Core still owns selector evaluation
and layout semantics. Explicit `source` information reaches core unchanged.

Only a constructor's own static field is read. To inherit rules explicitly:

```js
class SpecialTree extends TreeNode {
  static [spytial] = [...TreeNode[spytial], attribute('extra')];
}
```

Use an array-valued field, not a static getter. Class arrays are read afresh on
capture; the resulting snapshots are detached. Individual helper results are
immutable. `spytial` uses `Symbol.for('spytial-js.spec')` so separate module copies
can discover the same metadata key.

## Adapters and external types

Registries remain available for types you cannot edit and for custom data
projections. They are optional. A descriptor accepts `type`, `label(value)`,
`fields(value)`, `kind`, and `spec` (a helper array or raw spec object):

```js
const registry = createRegistry().type(ExternalNode, {
  type: 'ExternalNode',
  label: node => node.name,
  fields: node => ({ value: node.readPrivateValue(), next: node.next }),
  spec: [attribute('value')],
});
```

These adapters do not modify application objects. Explicit `type` names are
useful for selectors that must survive constructor-name minification. Registry
specs add to class-local rules; use `inheritRules: false` for a view that omits
both and supplies its own spec.

## Records versus dictionaries

The default interpretation of `{ left, right, value }` is a record: keys name
relations. For a dictionary, keys should be data:

```js
const stock = { count: 4 };
const inventory = { 'in stock': stock, featured: stock };
const registry = createRegistry().value(inventory, {
  kind: 'dictionary',
  label: () => 'Inventory',
});
const view = await diagram('#diagram', inventory, { registry });
```

Both entries point to the **same** stock node. `Map` always uses dictionary
entries and supports object keys. `registry.value` overrides the complete class
descriptor for that object. Constructor registrations match exact constructors;
there is no implicit inheritance of superclass rules. Class-local specs are
collected independently of these descriptors.

## Rule composition and alternatives

Specs may be helper arrays or ordinary objects with core's `constraints` and
`directives` arrays.
They are serialized as JSON (valid YAML) and parsed by core. There is no second
constraint language or JavaScript-specific selector evaluator.

1. Default compact-presentation directives are collected.
2. Each encountered class contributes its own `[spytial]` rules once, followed
   by its matching registry descriptor, in breadth-first discovery order.
3. A rendering call's helper array or object-valued `spec` is appended.

Constraints are cumulative. Appending a conflicting constraint does not override
an earlier one; core reports the conflict. Directive precedence remains core's.
Rules are dataset-wide: use type/domain restrictions in selectors where field
names are reused across types. Attaching a spec to a class or object controls
collection, **not automatic selector scoping**. Explicit `source` blocks are
preserved for author-facing conflict reports.

```js
// A different view of the same data, without registered rules:
await view.update(root, {
  inheritRules: false,
  spec: { constraints: [{ orientation: { selector: 'left + right', directions: ['below'] } }] },
});

// Raw YAML replaces all defaults and registered specs:
await view.update(root, { spec: `
constraints:
  - orientation: { selector: left + right, directions: [below] }
directives:
  - attribute: { field: value }
  - flag: hideDisconnectedBuiltIns
` });
```

Use `presentation: 'graph'` to disable automatic scalar attributes. This changes
only the generated presentation defaults, not the captured relational data.
Reset the call's spec with `{ spec: {} }` to return to object composition.

## API and lifecycle

| API | Purpose |
| --- | --- |
| `await diagram(target, value, options)` | Mount into a connected element or selector. |
| `await view.update()` | Capture the current root again after mutation. |
| `await view.update(nextValue, options)` | Replace the root; options may change `spec`, `inheritRules`, `presentation`. Passing `undefined` explicitly renders undefined. |
| `view.dispose()` | Stop rendering and remove only this mount. Idempotent. Later updates reject. |
| `view.fit()` | Refit after the host resizes the graph. |
| `view.element` | Core element for themes, view options, export, and other renderer APIs. |
| `view.snapshot` | Last rendered relational snapshot, root ID, field-name mapping, collected specs, warnings. Treat as read-only. |
| `view.result` | Core layout result, including constraint errors and warnings. |
| `view.diagnostics` | Current relationalizer, selector, layout, constraint, and rendering diagnostics. |
| `relationalize(value, options)` | Capture data without a browser or core. |
| `createRelationalizer(options)` | Reusable capture function with persistent object IDs. |
| `composeSpec(snapshot, options)` | Inspect the exact spec text that will reach core. |
| `selectorName(field)` | Selector-safe encoding of a JavaScript field name. |

Rendering options include `height` (number of pixels or CSS string), `label`
(accessible section label), `view` (core viewer options), `theme`, `core`, and
`coreUrl`. Relationalizer options include `registry`, `identity`, `maxAtoms`
(default 1000), and `maxTuples` (default 5000).

Capture is synchronous at each call. Renderer calls are queued, so a later
mutation cannot alter a previously requested snapshot. This is an explicit
debugging/teaching view, not a subscription to mutations or a time-travel player.
Await updates in a fast loop; there is no throttling or frame coalescing.
Each update recomputes layout. Stable IDs do not promise stable positions.

An inline live status region exposes diagnostics. You can also listen on the
mount target for the bubbling `spytial-diagnostics` event. Parse/traversal failures
reject; an update failing before rendering preserves the last diagram. Core
constraint conflicts retain core's fallback diagram with diagnostics. Rendering
failures cannot guarantee preservation of the old image. Initial failures reject
and clean up the mount; the host should display the rejected error.

## Loading and self-hosting

Core loads once on demand and concurrent requests share the load. A failed load
can be retried. An existing `globalThis.spytialcore` or explicit `core` object is
reused; the host owns its version. Otherwise the default is pinned to 6.5.1.

```js
await diagram('#diagram', data, {
  coreUrl: '/vendor/spytial-core-complete.global.js',
});
```

For a strict CSP, preload an allowed core script and pass its global through
`core`, or allow the CDN script origin. Data is converted and rendered locally;
the integration does not send values to a server. The engine's own asset and
browser-policy requirements still apply. No framework globals are installed by
this adapter. Modern browsers with native modules, WeakMap, and custom elements
are required.

## Verification

Use Node 22+; runtime modules have no package dependencies. Development checks
use Ajv to validate against core's schema and TypeScript to verify declarations:

```sh
nvm use # if you manage Node with nvm
npm ci
npm test
```

With the static server running, visit `/test/browser.html` for real-core browser
checks, including geometry, error recovery, identity, updates, and disposal.
The checks report a visible pass/fail summary and set the page title.

For sibling-core verification, serve the ecosystem parent directory instead and
open `/spytial-js/test/browser.html?core=local` or
`/spytial-js/examples/?core=local`. This reads the existing sibling build without
modifying it. The CDN and local modes are intentionally explicit.

The unit suite includes schema conformance for every generated helper, static
spec collection, unmodified selectors, and declaration checks. Browser checks
load the shipped demo and exercise its tree/dictionary buttons.

See [design decisions and limits](docs/DESIGN.md) and
[findings for the core integration skill](docs/integration-skill-notes.md).

## Updating spytial-core

For a published release, update the exact version and regenerate together:

```sh
npm run sync:core -- --version 6.5.1  # replace with the new released version
npm test
```

For development against a sibling checkout whose language artifacts are current:

```sh
npm run sync:core -- --from ../spytial-core
npm test
```

The local form also updates the runtime pin; use the local browser test mode until
that version is published. Sync checks manifest/schema agreement before writing,
prints added/removed/changed rules, and regenerates helper exports, declarations,
validation metadata, the helper reference, runtime version, and input hashes.

```sh
npm run codegen        # regenerate offline from checked-in vendor inputs
npm run codegen:check  # fail if generated files are stale; also runs in npm test/CI
```

Review and commit the vendor and generated diffs together. See the detailed
[core upgrade procedure](docs/core-upgrades.md). No generator runs in the browser.
