# Glade

Glade is an experimental workspace for connecting Bayesian model evidence,
reviews, and recorded decisions inside the researcher's coding environment.

The recommended direction is a rebuild as a Positron extension. A working
[disposable prototype](https://github.com/sims1253/glade/blob/prototype/positron-review/apps/positron-prototype/README.md)
lives on branch `prototype/positron-review`; it has been exercised in a real
Positron host with the same R handle used by the console.

The current Electron client requires `bg_serve()`, which Bayesgrove removed in
0.6.0. It does not work with the current Bayesgrove checkout. Glade now detects
that missing interface before opening or initializing a project.

See [the restart review](RESTART.md) for the proposed scope, desktop options,
and the integration work needed before Glade can be used again.

For development:

```bash
bun install
bun run dev:desktop
```

The existing renderer lives in `apps/web`; Electron uses it as its desktop UI.
Its directory name does not commit Glade to a browser client.

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

TypeScript uses Effect. Vendored [anti-slop](tools/oxlint/anti-slop/README.md)
rules apply to new files. Existing violations have explicit file-and-rule
exceptions in `.oxlintrc.json`; `bun run lint:strict` reports them without those
exceptions. Passing the regular lint check does not mean the old code meets
all anti-slop rules.

R integration tests still target the removed bridge. CI pins Bayesgrove 0.5.1 and
dagriculture 0.1.6 by commit to exercise the legacy bridge. Current Bayesgrove
remains unsupported by the desktop client.
