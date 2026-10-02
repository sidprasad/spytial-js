# Core language artifacts

`spytial-language.json` and `spytial-spec.schema.json` are copied unchanged from
the corresponding `spytial-core` package. The initial pin is version 6.5.1,
obtained from its published npm package. Core is maintained at
https://github.com/sidprasad/spytial-core and its package declares the MIT license.

`lock.json` is generated and records versions plus SHA-256 hashes of these exact
files. Use `npm run sync:core` to replace them together; see
../../docs/core-upgrades.md. Do not update the generated helper vocabulary by hand.
