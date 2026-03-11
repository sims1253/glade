# Glade

Glade is a desktop app for working with local Bayesgrove workflows.

Current release: `0.12.1`

## What you get

- a desktop-first workspace for local Bayesgrove projects
- a workflow canvas with guided actions and obligations
- a shared REPL and terminal surface inside the app
- setup checks for local dependencies such as R and `bayesgrove`
- in-app settings and health status for the local Glade session

## Requirements

Before running Glade, install:

- [R](https://cran.r-project.org/)
- `bayesgrove` in your local R environment

Glade will check your local setup on first launch and show any missing prerequisites in the app.

## Install and run

Download the desktop build for your platform from the project releases, then launch Glade like any other desktop app.

If you are running from source, install dependencies and start the desktop app with:

```bash
bun install
bun run dev:desktop
```

## Using Glade

From the main workspace you can:

- inspect your workflow graph
- review recommended actions and blocking obligations
- open Settings to fix local environment issues
- open the Health dialog to inspect the local session status

## Notes

Glade is focused on local Bayesgrove workflows. Hosted mode and non-local Glade-managed execution are not part of the current product surface.
