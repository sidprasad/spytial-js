# spytial-js

This repository owns JavaScript value recovery, class-local `[spytial]` specs,
and the browser embedding lifecycle. Shared selector/layout semantics belong in
spytial-core. Read README.md and package.json before changing behavior.

- Preserve selectors exactly as authored. Type attachment must not implicitly
  scope a selector or filter its tuples.
- The primary API is `static [spytial] = [orientation(...), attribute(...)];`.
  Registries are optional adapters, not required to discover class specs.
- Do not hand-edit src/generated/, docs/rule-helpers.md, or vendor/core/lock.json.
  Run `npm run codegen` after changing generator logic; run
  `npm run sync:core -- --version X.Y.Z` to update a published core release.
  `--from ../spytial-core` supports local development and also changes the runtime
  pin; use local assets until that release exists on the CDN.
- Run `npm ci` and `npm test` on Node 22+. The suite checks generation drift,
  emitted specs against core's schema, and the public TypeScript declarations.
- For rendering or attachment changes, serve the project and open
  test/browser.html. See docs/core-upgrades.md for local sibling-core mode.
- Commit vendor inputs and generated outputs together. Browser modules must not
  depend on the codegen tool or development packages at runtime.
