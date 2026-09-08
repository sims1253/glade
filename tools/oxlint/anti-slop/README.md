# anti-slop in Glade

Production source vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)
at commit `e8c4880471b23ab7f216fba7b27d173a6ef07d4c`. The upstream MIT license
is included. Upstream tests were not copied. Oxlint and `@oxlint/plugins` are
both pinned to `1.51.0`, the repository's existing Oxlint version.

`.oxlint-strict.json` enables all 15 generic rules and the Effect rule.
`.oxlintrc.json` adds explicit file-and-rule exceptions for the 396 violations
found in retained code during the restart review. These exceptions allow further
violations of that rule in that file; they are not an exact violation-count
baseline. New files and the rewritten replay cache receive the full ruleset.
Remove exceptions as the corresponding code is rewritten or deleted.

`bun run lint` uses the exceptions. `bun run lint:strict` reports the remaining
violations and exits unsuccessfully until they are resolved. The vendored rules
are excluded from both checks, as upstream's installation guidance recommends.
