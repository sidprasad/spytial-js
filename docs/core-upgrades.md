# Updating the core dependency

The authoring API and browser engine must describe the same release. The checked-in
core manifest is the source for helpers; the schema is an independent conformance
check. Consumers never need the generator or development dependencies.

## Published release

```sh
npm ci
npm run sync:core -- --version 6.5.1 # substitute the exact new release
npm test
```

The sync command fetches both artifacts from the pinned jsDelivr npm URL and
checks that the browser bundle is available. It requires an exact version,
checks manifest/schema agreement, and constructs all generated outputs before
writing. Fetch failures, missing bundles, mismatched versions, and unsupported
manifest shapes fail without changing tracked inputs or outputs. Disk-write
failures are not transactional; restore/retry if the disk becomes unavailable.

## Sibling checkout during development

First regenerate core's language artifacts in that repository, then:

```sh
npm run sync:core -- --from ../spytial-core
npm test
```

The command checks that the manifest matches core's package version. It updates
the generated runtime version too, so an unpublished core revision must be tested
with an explicitly supplied local `coreUrl` or preloaded `core` object. The demo
and browser harness support `?core=local` when the ecosystem parent is served.
Before release, use `--version` for the published artifact and test the actual CDN.

## What gets generated

| File | Role |
| --- | --- |
| `src/generated/helpers.js` | Named helper exports for every manifest form. |
| `src/generated/helpers.d.ts` | Object and positional signatures, required options, enum types, style blocks. |
| `src/generated/catalog.js` | Runtime validation fields, bounds, direction conflicts, sections, deprecations. |
| `src/generated/core-version.js` | Pinned runtime core version and language version. |
| `vendor/core/lock.json` | Exact versions and SHA-256 hashes of both inputs. |
| `docs/rule-helpers.md` | Available helpers, positional arguments, sections, and deprecation status. |

The generator does not maintain a separate list of core constraints or directives.
Mapping forms accept an options object; positional arguments follow required fields
in manifest order, with optional fields in a final options object. Scalar forms
take one scalar. Deprecated helpers remain available with their upstream section
and vocabulary. New field kinds or unsupported shapes fail loudly instead of
producing helpers that silently omit data.

The handwritten part is `src/rules.js`: it validates against the generated
metadata, creates immutable rule descriptors, and separates constraints from
directives. It does not evaluate selectors, scope rules, or solve layouts.

## Review and verification

Sync prints a summary of added, removed, and changed forms. Review the complete
diff, especially required-field changes: adding/reordering a required field can
change a positional signature, while the object form stays explicit. Type-check
and run example call sites after such changes. Check removed/deprecated forms and
changes to numeric bounds, closed vocabularies, or canonical sections.

`npm test` first runs the offline drift check. Unit tests also verify every
generated helper's upstream example against the pinned JSON Schema, as well as
the static `[spytial]` API, selector preservation, and TypeScript declarations.
Open `test/browser.html` to check actual rendering and demo interactions against
the new core. Use both local and CDN modes when changing a sibling core checkout.

Commit the two vendor artifacts, lock, generated outputs, and any corresponding
host/API changes together. CI runs `npm ci` and `npm test`. Browser checks are an
explicit manual gate; they are not currently automated in GitHub Actions.

For offline regeneration without changing the pin:

```sh
npm run codegen
npm run codegen:check
```
