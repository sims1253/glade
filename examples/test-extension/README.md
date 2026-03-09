# Test Extension

This example package demonstrates the phase-08 extension shape:

- Layer 1: a schema-defined `posterior_summary` node kind that works without any custom GUI code
- Layer 2: an optional `inst/gui/index.js` bundle that overrides the generic schema form with a custom renderer

The descriptor intentionally exercises every schema field type supported by the Glade auto-UI.

## File structure

- `R/test_extension.R` defines the extension descriptor and registration helper.
- `inst/gui/index.js` provides the optional browser bundle that overrides the generic schema-driven UI.
- `DESCRIPTION` and `NAMESPACE` make this installable as a normal R package.

## Usage / Getting Started

```r
devtools::load_all("examples/test-extension")
glade_register_test_extension(project)
```

- Start Glade against a bayesgrove session that loads this package.
- Add a `posterior_summary` node from the canvas.
- Confirm that parameters can be edited through either the schema-driven form or the custom bundle UI.

## What to observe

- Without a GUI bundle, the `parameter_schema` fields render through Glade's generic auto-form.
- With `inst/gui/index.js` present, the bundle can register a custom renderer for the same node kind.
- The example exercises strings, booleans, enums, file paths, node refs, nested objects, and arrays.

## Context

- Phase 8 introduces the extension registry, schema-backed node parameters, and trusted local GUI bundle loading.
- This package exists as the smallest end-to-end example of that contract inside the repo.
