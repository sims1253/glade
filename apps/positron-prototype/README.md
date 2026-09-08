# Positron review prototype

This disposable extension asks whether Glade can connect evidence and review
inside the researcher's existing editor and R session. It is not a production
client or a mock of the old Glade server.

The result supports rebuilding the application layer as a small extension.
The real session round trip works. The full evidence, question, and model
comparison interface still needs a trial with a real analysis.

## Run it

Requires a recent Positron with the structured runtime evaluation API, R, and
Bayesgrove. Verified with Positron 2026.09.1-2, R 4.6.1, and Bayesgrove 0.7.0 on
Linux under WSL. Ordinary VS Code is not supported by this prototype.

From this directory:

```bash
bun run dev
```

This installs dependencies, builds the extension, and opens a development host.
Set `POSITRON_BIN` if the Positron executable is not named `positron` on PATH.
The host is an extra window; the extension is not installed into your normal
editor profile.

In that window:

1. Start an R console with **Start Session**.
2. Run **Glade: Create Scratch Review Project** from the command palette.
3. Accept `glade_prototype` as the R object to attach to.
4. Inspect the simulated diagnostic evidence, choose a decision, and write a
   rationale. Record the decision and inspect the refreshed history.

The scratch project lives in R's temporary directory. Its diagnostics are
simulated; the Bayesgrove calls, review rules, and recorded decisions are real.
The scratch command refuses to overwrite an existing `glade_prototype` object.

To use a project already open in this console, run **Glade: Open Review
Prototype** and enter its handle's variable name instead. A click on
**Record decision in Bayesgrove** writes to that project. The extension never
opens a second writable handle.

## What happens

```text
Refresh
  → select the attached R session by ID
  → evaluate the R presentation helper
  → bg_next_actions + bg_read_summaries + bg_snapshot
  → decode the JSON result with Effect Schema
  → show reviews and evidence

Record decision
  → compare the displayed snapshot token with current evidence
  → bg_execute_action(action_id, choice, rationale)
  → reload the snapshot
```

No HTTP server, WebSocket relay, process supervisor, or Glade database is needed.
The R helper projects presentation data and checks freshness. Bayesgrove decides
which reviews exist, what choices they accept, and what a decision does.

## Checks performed

- The actual extension host displayed a scratch review and its diagnostic metrics.
- A form submission recorded a decision and rationale, then showed the new history.
- The R console returned one decision from the same `glade_prototype` handle.
- A direct R probe rejected a submission using the previous snapshot token.
- While R ran `Sys.sleep(10)`, refresh was rejected immediately as busy.
- After restarting R, refresh reported the missing handle instead of opening a
  new project session.
- A probe with simulated host responses verified the 60-second timeout, control
  recovery, and rejection of a late response from the expired request.
- Strict anti-slop lint, TypeScript checking, and the extension build passed.

Run the static checks with:

```bash
bun run lint
bun run typecheck
bun run build
```

No new automated test suite was added for the disposable prototype. The host
checks were performed interactively through the editor and panel.

## Limits that matter to the rebuild

This view supports project-scope review actions with enumerated choices. It does
not implement plots, comparison, branch navigation, a graph canvas, or a general
form renderer. It uses explicit refresh. Freshness labels describe the last
successful refresh, not continuous synchronization with R.

A busy session leaves the old evidence visible. Requests stop waiting after
60 seconds. This does not cancel R evaluation or establish whether a decision
was recorded; check the R console and refresh before deciding again. A restarted
session needs its
project reopened in R and Glade reattached. The helper protects against stale
submissions within this single-session experiment; a production client still
needs a policy for external changes and uncertain mutation outcomes.

Silent evaluation did not immediately refresh Positron's Variables pane during
the experiment. A subsequent console command did. Avoid assuming every host view
updates when an extension executes code.

The panel preserves an unsent rationale across its own redraws, but complete
editor-restart recovery, focus management, accessibility, and other operating
systems remain unverified. Do not promote this code directly to production.

[Captured extension host](evidence/recorded-review.png).

[Pending review in the editor](evidence/pending-review.png).

For this WSL experiment, a current Linux Positron was extracted under
`/tmp/glade-positron-app`; the pre-existing `positron` on PATH points to a Windows
installation. The running experimental host uses its own profile under
`/tmp/glade-positron-user`. To reopen the same host after building:

```bash
/tmp/glade-positron-app/usr/share/positron/positron \
  --no-sandbox --disable-gpu \
  --user-data-dir=/tmp/glade-positron-user \
  --extensions-dir=/tmp/glade-positron-extensions \
  --extensionDevelopmentPath="$PWD" /tmp/glade-positron-workspace
```

Those `/tmp` paths belong to this local experiment and are not installation
requirements for the extension. Use `bun run dev` with a current normal Positron
installation elsewhere.
