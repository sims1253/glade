# Glade

Glade is an experimental workspace for connecting Bayesian model evidence,
reviews, and recorded decisions inside the researcher's coding environment.

The recommended direction is a rebuild as a Positron extension. A working
[disposable prototype](apps/positron-prototype/README.md) is preserved at
`apps/positron-prototype/`; it has been exercised in a real Positron host with
the same R handle used by the console.

The standalone Electron client and its workspace were removed before the 0.17.0
release. That client needed `bg_serve()`, which Bayesgrove removed in 0.6.0, so
it could not run against the current Bayesgrove checkout. Its reference value
lives in git history. See [the restart review](RESTART.md) for the proposed
scope, desktop options, and the integration work needed before Glade can be
used again.

## Development

The active surface is the prototype under `apps/positron-prototype/`. Its
[README](apps/positron-prototype/README.md) describes what it covers and how to
run it against a Positron host:

```bash
cd apps/positron-prototype
bun run dev
```

Workspace checks run from the repository root:

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run build
```

TypeScript uses Effect. Vendored [anti-slop](tools/oxlint/anti-slop/README.md)
rules apply to TypeScript sources. The per-file exceptions that the retired
client carried for its existing violations were removed with it, so
`bun run lint` and `bun run lint:strict` currently run the same checks. Future
exceptions would be listed per file in `.oxlintrc.json`; `lint:strict` reports
violations without them.
