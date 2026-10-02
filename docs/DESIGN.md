# Decisions from the JavaScript integration

The owner is `spytial-js`: recovery of JavaScript data, collection of user rules,
and the browser embedding lifecycle. The integration uses canonical JSON and
core's existing pipeline; no changes to `spytial-core` were necessary.

## What to relationalize

Start at an explicitly supplied root and walk reachable state. Do not enumerate
the page, lexical scope, global variables, prototypes, or the DOM. Reflection is
iterative and bounded. Object reference identity is tracked with a WeakMap before
children are visited, so cycles terminate and aliases remain visible.

| JavaScript value | Representation |
| --- | --- |
| Plain record or class instance | One object atom; own enumerable string data properties become binary relations `(owner, value)`. |
| Explicit dictionary | Container atom plus `JSEntry` atoms; `entry(container, entry)`, `key(entry, key)`, `value(entry, value)`. |
| Map | Same entry shape, with keys walked normally, including object keys. |
| Array | Container plus `JSSlot` atoms; `item(array, slot)`, `index(slot, integer)`, `value(slot, value)`, `next(slot, nextPresentSlot)`, `length(array, integer)`. |
| Set | `member(set, value)`; no manufactured spatial order. |
| Date | An object atom with an `iso` string relation. Invalid dates are explicit. |
| Scalar | Atom deduplicated by type and value, including separate null and undefined atoms. |
| Function, DOM node, WeakMap, WeakSet, Promise | Opaque object atom and a warning. A registered adapter can expose a deliberate projection. |

Why entries instead of flattened field names? Arbitrary dictionary keys are data,
and map keys can be objects. Why entry atoms instead of Python's ternary `kv`?
Both are valid. Entry atoms provide ordinary binary paths for key/value styling,
and keep entry identity visible in this browser UI. The integration skill should
require preservation of key/value pairing, not prescribe one arity for all hosts.

Array slot identity is `(array ID, index)`, not element identity. Two positions
can point to one shared object, and two occurrences of `7` remain two positions.
Holes have no slot, explicit undefined has a slot, and length preserves trailing
holes. `next` means the next *present* slot, not necessarily index plus one. Map
and dictionary entries retain insertion/enumeration order in emitted data but
receive no invented spatial constraints. Object enumeration follows JavaScript's
rules, including numeric keys preceding other string keys.

All tuple signatures use the explicit common supertype `JSValue`. Atoms retain
their concrete type. Scalars additionally inherit `JSScalar` and are marked
`isBuiltin`, which allows core to hide disconnected literal nodes after folding
scalar edges into attributes. This avoids losing field data during recovery just
because the default presentation should be compact.

## Identity and names

Objects get `object:<counter>` IDs in a per-relationalizer WeakMap. A mounted view
reuses that relationalizer across updates. Rebuilding an equal object makes a new
object by default. Supply `identity: value => value.id` when application IDs should
bridge rebuilt snapshots. Supplied IDs include their primitive type; duplicate
IDs on distinct objects within one capture throw rather than silently merging.
The callback applies to every encountered object, including containers; return
undefined for objects without application identity.

Scalar IDs include both type and a lossless textual value. Numbers distinguish
`-0` and `0`, and preserve NaN and infinities as labels; bigint labels remain JSON
serializable. Symbols are distinguished by identity within a snapshot. Symbol
IDs are not stable across captures in this prototype.

Field names use a reversible, injective selector-safe encoding. Ordinary `left`
stays `left`; punctuation, reserved words, and the reserved escape prefix are
encoded. `snapshot.fieldNames` records the mapping. Types inferred from constructor
names are convenient but are not a stable API under minification. Register an
explicit `type` for authored selectors. Unregistered constructors with the same
name receive different names. Explicit registrations using the same type name
deliberately share that selector type; names beginning with `JS` are reserved.

## Rule attachment

The primary API is a native static field: `static [spytial] = [orientation(...),
attribute(...)];`. `spytial` is an exported symbol. The walker collects the rules
once per encountered constructor automatically, without a registry passed to the
render call. Metadata remains on the class and is not traversed as application
state. A getter is rejected instead of invoked implicitly.

The rule helpers come from core's machine-readable manifest. They construct
immutable descriptors carrying the canonical section and core entry, and check
arguments against generated metadata. `npm run sync:core` updates the pinned
manifest/schema and generates exports, declarations, validation metadata, runtime
version, and documentation together. `npm test` rejects stale outputs and checks
all helper examples against core's JSON Schema.

Attaching a rule controls its collection, not its scope. Every selector is passed
through unchanged. No implicit class restriction is added. Only own static
metadata is read; a subclass can explicitly spread its parent's rule array.

Registries remain as adapters for external classes, dictionaries, custom labels,
explicit selector type names, and fields projections. Their specs add to class
specs. A value descriptor replaces the constructor registry descriptor, but does
not erase the constructor's static rules. `inheritRules: false` disables collected
rules for a particular view. Call-site helper arrays or raw objects compose last;
raw YAML replaces the complete spec. Explicit source provenance is preserved.

## Presentation in a browser

The browser already has a document and an execution loop. The natural operation
is `await diagram(target, root)`: put one diagram into a host-chosen element.
Opening a new tab or replacing the page would break the surrounding application.

The application remains authoritative for values. Its event handlers mutate data
and then call `await view.update()`. Automatic proxies would miss pre-existing
aliases, complicate Maps/Sets and private fields, and risk changing program
behavior. MutationObserver watches DOM changes, not arbitrary object mutation.

The handle exposes the core graph for theme, export, zoom, and font configuration;
it also exposes structured diagnostics and a local live status region. Disposal
stops core work and removes only the owned section. Multiple diagrams share the
loaded engine but have independent data, rules, evaluators, and renderers.

## What else needs an explicit decision

- **Reflection effects:** getters and `toJSON` are not invoked automatically.
  Proxies can execute traps during reflection, and user adapters/identity callbacks
  can run arbitrary code. This is trusted same-page JavaScript, not a sandbox.
- **Hidden state:** inherited, non-enumerable, private, and symbol-keyed properties
  are not expanded. Enumerable accessors and symbol keys produce warnings. A
  fields adapter is the intentional escape hatch. Built-in Map/Set/Date handling
  focuses on built-in state; extra attached properties need an adapter.
- **Exotic objects:** cross-realm built-ins and specialized browser objects are
  not fully supported. Same-realm arrays, Map, Set, and Date are the supported
  collection/date forms; other objects receive generic own-field treatment unless
  explicitly opaque. This is not a lossless serializer or a reifier.
- **Scale:** defaults cap atoms and tuples, not runtime or string size. Reflecting
  a huge object or copying a huge Map may still take time before the cap trips.
  The main-thread solver targets small/medium structures. Choose smaller roots
  or adapters; workers, cancellation during capture, and lazy expansion remain
  future work.
- **Failures:** distinguish capture, parse, selector, constraint, and rendering
  errors. A visible fallback diagram must not imply that all rules were satisfied.
- **Sequence semantics:** object IDs persist, but updates relayout. Stable layout
  policies, animations, timeline capture, and frame coalescing are separate future
  choices. This adapter does not implement a competing sequence system.
- **Resize:** the host owns dimensions. Call `fit()` after resizing. No automatic
  fit observer fights the user's pan/zoom position.
- **Accessibility:** status messages and core controls are accessible. Full
  keyboard/semantic graph exploration needs core's optional explorer and is not
  provided by this prototype. A host should supply a textual alternative where
  the diagram carries essential content.
- **Delivery:** verify a pinned asset exists. The local checkout advertised 6.5.2,
  but that CDN URL returned 404; the published version was 6.5.1. The default pins
  the published release. A host can supply self-hosted assets for offline/CSP use.
- **Trust boundaries:** values stay in-browser. Text is passed as data; status
  output uses textContent. Raw specs and adapters are trusted application code,
  not an interface for executing arbitrary untrusted specifications.

## Scope deliberately left for later

No npm publication, framework hooks, reverse editing, custom evaluator, runtime
decorators, automatic mutation tracking, source editor, or replacement layout
engine. The current example is evidence for the integration skill and a usable
embedding API, not a release of every possible JavaScript presentation mode.
