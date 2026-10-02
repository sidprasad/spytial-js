# Generated rule helpers

Generated from spytial-core 6.5.1, language 2026-09-18.

Every mapping helper accepts a core-shaped options object. Positional shortcuts follow
the manifest's required fields, with an optional final options object. Selectors are
passed through unchanged. Deprecated forms remain available but are marked below.

| Helper | Positional form | Section | Status |
| --- | --- | --- | --- |
| `orientation` | `orientation(selector, directions, options)` | constraints | Current |
| `cyclic` | `cyclic(selector, options)` | constraints | Current |
| `align` | `align(selector, direction, options)` | constraints | Current |
| `group` | `group(selector, name, options)` | constraints | Current |
| `size` | `size(width, height, options)` | constraints | Current |
| `hideAtom` | `hideAtom(selector, options)` | constraints | Current |
| `flag` | `flag(value)` | directives | Current |
| `atomStyle` | `atomStyle(options)` | directives | Current |
| `edgeStyle` | `edgeStyle(field, options)` | directives | Current |
| `attribute` | `attribute(field, options)` | directives | Current |
| `tag` | `tag(toTag, name, value, options)` | directives | Current |
| `hideField` | `hideField(field, options)` | directives | Current |
| `inferredEdge` | `inferredEdge(name, selector, options)` | directives | Current |
| `icon` | `icon(selector, path, options)` | directives | Deprecated; use atomStyle |
| `atomColor` | `atomColor(value, selector, options)` | directives | Deprecated; use atomStyle |
| `edgeColor` | `edgeColor(field, value, options)` | directives | Deprecated; use edgeStyle |

Helpers return immutable rule descriptors. Unknown fields, missing required fields,
invalid enum values, contradictory directions, and invalid numeric ranges throw early.
Core remains responsible for selector evaluation and layout semantics. The object form
is the stable escape hatch if upstream changes which fields are required.
