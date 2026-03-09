glade_elicito_descriptor <- function() {
  list(
    id = "glade.elicito",
    package_name = "glade.elicito",
    version = "0.1.0",
    node_types = list(
      list(
        id = "prior_elicitation",
        kind = "prior_elicitation",
        runtime = "uvx",
        command = "elicito",
        args_template = list("--input", "{input_json_path}", "--output", "{output_json_path}"),
        input_serializer = "json_file",
        output_parser = "json_file",
        title = "Prior elicitation",
        description = "Run elicito through uvx and persist its JSON output as a workflow artifact.",
        parameter_schema = list(
          type = "object",
          properties = list(
            family = list(
              type = "string",
              title = "Distribution family",
              enum = list("normal", "lognormal", "gamma")
            ),
            lower = list(
              type = "number",
              title = "Lower plausible bound"
            ),
            upper = list(
              type = "number",
              title = "Upper plausible bound"
            ),
            quantile = list(
              type = "number",
              title = "Central quantile mass"
            )
          ),
          required = list("family", "lower", "upper")
        ),
        output_schema = list(
          type = "object",
          properties = list(
            prior = list(type = "object"),
            diagnostics = list(type = "object")
          )
        )
      )
    ),
    domain_packs = list(
      list(
        id = "prior_workflows",
        title = "Prior workflows",
        description = "Reference prior elicitation tools executed outside the shared R session."
      )
    )
  )
}

glade_register_elicito_extension <- function(project) {
  descriptor <- glade_elicito_descriptor()

  if (!requireNamespace("bayesgrove", quietly = TRUE) ||
      !exists("bg_register_extension_package", envir = asNamespace("bayesgrove"))) {
    stop("bayesgrove::bg_register_extension_package() is required for this example extension.")
  }

  bayesgrove::bg_register_extension_package(project, descriptor)
}
