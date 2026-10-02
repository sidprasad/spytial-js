# Evidence for improving the core integration skill

This document records lessons from a working client-side JavaScript integration.
It is input to a future edit of `spytial-core`'s integration skill; it does not
change that skill or the core implementation. The existing Python relationalizers,
Rust entry-point documentation, core integration guide, schema, and renderer source
were reference material. Implementation and tests live entirely in `spytial-js`.

## Keep the four questions, make the answers executable

| Question | JavaScript answer | Evidence to require from another integration |
| --- | --- | --- |
| What is recovered? | Reachable own state; reference identity; explicit collection positions/entries. | A payload containing a shared reference, a cycle, repeated values, and a container. |
| Where do rules live? | A static `[spytial]` rule list, optional registry adapters, and call-site specs. | Nested rule collection, composition order, and an alternate-view example. |
| Where and when does it appear? | A host-selected DOM mount, an explicit capture/update call, and disposal. | Two diagrams beside ordinary application code, an update, and teardown. |
| What is missing from raw data? | Array positions, map pairing, derived fields via adapters, safe names, diagnostics. | A concrete example and a test for every claimed invariant. |

## Proposed changes to the workflow

1. **Ask a short set of questions, then implement within the answers.** Runtime,
   first structure, loading/distribution, presentation surface, and attachment
   idiom were enough here. The user delegated updates and API details. Treat that
   as authority to choose explicit updates, build the example, and report tradeoffs;
   do not require another abstract design sign-off before a runnable prototype.

2. **Inspect local implementations before fetching summaries.** A sibling checkout
   gives exact API and identity behavior. Here Python's dictionary implementation
   emits ternary `kv`, while JavaScript entries are an intentional binary-schema
   choice. Neither representation should be mistaken for a core requirement.
   Docs and skill examples may lag renamed integrations or removed adapters.

3. **Separate the data contract from the default picture.** Recover scalar fields
   faithfully, then use core attributes to render them compactly. Show the emitted
   JSON and final spec. Test mixed scalar/object targets of the same field so a
   convenience presentation does not remove structural links.

4. **Require a record-versus-dictionary decision.** In JavaScript both are objects.
   Flattening arbitrary keys into relation names can erase the meaning of a map;
   treating every object as a dictionary makes tree selectors awkward. Use a clear
   default and a per-value escape hatch. Include non-identifier keys and object
   keys in the acceptance example.

5. **Specify identity at two timescales.** Within one capture, aliases must share
   and distinct objects must not collapse. Across captures, persistent references
   or application-supplied IDs can identify continuity. Test duplicate supplied
   IDs. Separately state scalar equality and collection-slot identity policies.

6. **Do not equate emitted tuple order with spatial order.** An array's order is
   data (`index`, `next`); set order should not be invented. Preserving enumeration
   order alone does not guarantee the diagram will display that order.

7. **Test direction with geometry.** For `(parent, child)`, `below` applies to the
   child. A render-only smoke test missed an upside-down tree in the first draft.
   The browser regression now checks child.x < parent.x and child.y > parent.y.
   Ask the integrator to write down one tuple and its intended picture first.

8. **Make attachment scope and composition explicit.** Class-local and registry attachment here
   collect rules; it does not narrow global selectors automatically. Require a
   statement of class matching, inherited rules, per-value overrides, duplicate
   collection, constraint conflicts, and raw-spec replacement behavior. Do not
   require a custom DSL where core-shaped data objects are idiomatic.

9. **For in-process embeddings, lifecycle is a first-class subproblem.** Define who
   owns the mount, values, updates, dimensions, diagnostics, and disposal. Capture
   at call time before asynchronous loading/rendering. Check concurrent updates,
   failed updates, multiple mounts, and queued work during teardown. These do not
   arise in the same way for a Python function that exports an HTML file.

10. **Verify the delivered asset, not just local code.** The local core manifest
    listed 6.5.2, whose pinned CDN URL returned 404. The registry published 6.5.1.
    Run the browser checks with both the actual pinned CDN and the sibling build.
    A stubbed renderer or local-only demo cannot validate the loading contract.

## Suggested acceptance checklist

- The selected structure produces inspectable canonical JSON with correct tuple
  endpoints, arity, types, and built-in primitive flags.
- A shared object is one atom; a cycle terminates; equal but distinct objects are
  distinct. The identity policy for rebuilt snapshots is documented.
- Collections preserve pairing, position, duplicates, holes, and missing values
  where those distinctions exist in the host.
- Registered specs, call-site changes, raw specs, and provenance reach core
  without a competing constraint implementation.
- The diagram is in the intended host surface. At least one layout rule is
  checked geometrically, not merely accepted by a parser.
- Mutating host data and requesting another capture works. Cleanup preserves
  unrelated host content and other diagrams.
- Invalid specs and unsatisfiable constraints reach the user visibly and through
  an inspectable API. A failed update can recover.
- A pinned, available delivery path and an offline/self-hosted option are clear.
- Unsupported host values, reflection effects, accessibility scope, and scale
  limits are stated alongside concrete adapter escape hatches.

The useful outcome of an integration skill is a small verified host integration
plus its decision record. This prototype supplies that evidence without making
JavaScript-specific reflection or lifecycle behavior part of core.

## Revision after trying the API with its author

The initial registry-first API put too much plumbing between the type definition
and `diagram()`. The agreed primary surface is now:

```js
class TreeNode {
  static [spytial] = [
    orientation('left', ['below', 'left']),
    attribute('value'),
  ];
}
```

A CDN requirement does not justify abandoning class-local metadata: native static
fields provide it without decorator syntax or a compiler. Generate helper functions
from core's manifest rather than asking users to hand-author nested schema objects.
The registry remains an escape hatch for classes that cannot be edited.

Attachment does **not** imply selector scoping. The user explicitly rejected
implicit scoping to the declaring type. An integration skill should elicit that
choice rather than assume decorators change selector meaning.

## MiniZinc solution demo

The map-coloring demo adds evidence for integrations that consume solver output:

- A solution array is not the domain graph. The application supplies the meaning
  of its one-based indices and the fixed topology. Seven persistent region
  objects receive new color values; aliases and IDs survive solution browsing.
- Recovery and presentation remain separate. Region adjacency uses ordinary JS
  arrays, recovered with slot atoms. The class specification derives a direct
  `border` relation with `inferredEdge('border', 'adjacent.item.value')` and hides
  the container nodes without deleting them from the relational snapshot.
- Structural rules live in `static [spytial]`. Per-solution colors use call-site
  rules over explicitly authored selectors such as `Coloring.WA`. No selector
  is implicitly restricted to its declaring type.
- Unsatisfiable model results belong to the host application's status UI, not
  Spytial's layout-conflict diagnostics. Clear the old assignment so it cannot
  masquerade as a solution to the new parameters.
- Bound enumeration and own the worker lifecycle. This example collects at most
  24 solutions before browsing, supports cancellation, and terminates active and
  pooled MiniZinc workers. It does not enqueue a render for every solver event.

The browser acceptance test uses actual CDN MiniZinc/Gecode output and checks
border endpoints, node fills, unsatisfiability, identity, paging, and cancellation
followed by another solve. These are stronger evidence than a hard-coded valid
assignment or checking only that the renderer produced an SVG.
