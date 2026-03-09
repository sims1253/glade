# Elicito Node Pack

This optional addon-style example package demonstrates the phase 09 multi-runtime extension shape for Glade.

It declares a `prior_elicitation` node kind that executes through the Bun server with:

- `runtime = "uvx"`
- `command = "elicito"`
- `input_serializer = "json_file"`
- `output_parser = "json_file"`

The bundled GUI component is intentionally small. It shows how a trusted Layer 2 bundle can
surface runtime-specific guidance while the actual execution still happens in the Bun server.

This package is not part of Glade core. It exists to show what a default addon pack could look
like without adding an `elicito` dependency to the main app.

## Registering the Extension

```r
devtools::load_all("examples/elicito-node-pack")
project <- bayesgrove::bg_open("/path/to/project")
glade_register_elicito_extension(project)
```

## Runtime Requirement

`uvx` must be available on `PATH` for this example to run end to end:

<https://docs.astral.sh/uv/>
