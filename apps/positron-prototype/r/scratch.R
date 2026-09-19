if (exists("glade_prototype", envir = .GlobalEnv, inherits = FALSE)) stop("glade_prototype already exists. Keep it or remove it in R before creating another scratch project.")
# Disposable data for exercising the review UI, not a fitted statistical model.
glade_prototype <- bayesgrove::bg_init(
  tempfile("glade-prototype-wipe-me-"),
  project_name = "Scratch review: simulated sampler diagnostics",
  workflow_packs = list("bayesgrove.default_bayesian")
)
bayesgrove::bg_register_node_kind(glade_prototype, "fit", executor = function(node, inputs) {
  list(
    result = list(note = "Simulated diagnostics for an interface experiment"),
    summaries = list(list(
      summary_kind = "hmc_diagnostics", passed = FALSE, severity = "warning",
      metrics = list(divergences = 11L, rhat_max = 1.03, ess_bulk_min = 180L)
    ))
  )
})
local({
  node <- bayesgrove::bg_add_node(glade_prototype, "fit", label = "Centered model (simulated)")
  bayesgrove::bg_run(glade_prototype, targets = node)
})
