glade_test_extension_descriptor <- function() {
  list(
    id = "glade.testextension",
    package_name = "glade.testextension",
    version = "0.1.0",
    node_types = list(
      list(
        id = "posterior_summary",
        kind = "posterior_summary",
        runtime = "r",
        title = "Posterior summary",
        description = "Summarize posterior draws with schema-driven parameters.",
        input_schema = list("fit"),
        output_schema = "summary",
        parameter_schema = list(
          type = "object",
          properties = list(
            title = list(type = "string", title = "Title"),
            draws = list(type = "integer", title = "Draw count"),
            include_intervals = list(type = "boolean", title = "Include intervals"),
            summary_stat = list(
              type = "string",
              title = "Summary statistic",
              enum = list("mean", "median", "mode")
            ),
            output_path = list(
              type = "string",
              title = "Output path",
              format = "file-path"
            ),
            fit_node_id = list(
              type = "string",
              title = "Fit node",
              format = "node-ref"
            ),
            annotations = list(
              type = "object",
              title = "Annotations",
              properties = list(
                subtitle = list(type = "string", title = "Subtitle")
              )
            ),
            metrics = list(
              type = "array",
              title = "Metrics",
              items = list(
                type = "object",
                properties = list(
                  name = list(type = "string", title = "Metric name")
                )
              )
            )
          )
        )
      )
    ),
    domain_packs = list(
      list(
        id = "posterior_reporting",
        title = "Posterior reporting"
      )
    )
  )
}

glade_register_test_extension <- function(project) {
  descriptor <- glade_test_extension_descriptor()

  if (!requireNamespace("bayesgrove", quietly = TRUE) ||
      !exists("bg_register_extension_package", envir = asNamespace("bayesgrove"))) {
    stop("bayesgrove::bg_register_extension_package() is required for this example extension.")
  }

  bayesgrove::bg_register_extension_package(project, descriptor)
}
