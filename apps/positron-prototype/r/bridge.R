# Presentation projection for the disposable extension. Bayesgrove owns all rules.
glade_review_request <- function(handle, request) {
  guide <- bayesgrove::bg_next_actions(handle)
  snapshot <- bayesgrove::bg_snapshot(handle)
  summaries <- bayesgrove::bg_read_summaries(handle, include_stale = TRUE)
  token <- digest::digest(list(guide, snapshot$graph$version, summaries, snapshot$decisions), algo = "sha256")
  # The TypeScript contract requires a string in every projected field, so degraded
  # data is coerced here instead of failing the decode as a JSON null downstream.
  fallback <- function(x, default = "") {
    if (is.null(x) || length(x) == 0) return(default)
    value <- as.character(x[[1]])
    if (length(value) != 1 || is.na(value)) default else value
  }
  array <- function(x) {
    kept <- Filter(Negate(is.null), x)
    if (length(kept) == 0) list() else unname(as.list(kept))
  }
  strings <- function(x) array(Filter(function(v) is.character(v) && length(v) == 1 && !is.na(v), as.list(x)))
  metric_value <- function(value) {
    if (is.list(value)) value <- unlist(value)
    if (!is.atomic(value) || length(value) == 0) return("NA")
    paste(format(value, trim = TRUE), collapse = ", ")
  }
  if (identical(request$kind, "decide")) {
    if (!identical(request$token, token)) stop("Evidence changed. Refresh and review it before recording a decision.")
    action <- if (is.character(request$action_id) && length(request$action_id) == 1) guide$actions[[request$action_id]] else NULL
    if (is.null(action) || !identical(action$payload$template_ref, "review_decision")) {
      stop("This prototype only records review decisions. Refresh the review list.")
    }
    choices <- action$invocation$input$fields$choice$enum
    if (!is.character(choices) || length(choices) == 0) {
      stop("This review does not offer enumerated choices, and this prototype only records review decisions with enumerated choices.")
    }
    choice <- request$choice
    if (!is.character(choice) || length(choice) != 1 || is.na(choice)) {
      stop(sprintf("A single choice is required. This review accepts: %s.", paste(choices, collapse = ", ")))
    }
    if (!choice %in% choices) {
      stop(sprintf("Choice %s is not offered by this review. Choose one of: %s.", sQuote(choice), paste(choices, collapse = ", ")))
    }
    bayesgrove::bg_execute_action(handle, request$action_id, overrides = list(
      choice = choice, rationale = request$rationale
    ))
    return(glade_review_request(handle, list(kind = "snapshot")))
  }
  reviews <- Filter(function(a) identical(a$payload$template_ref, "review_decision") && !is.null(a$action_id), guide$actions)
  list(
    project = fallback(snapshot$name),
    path = fallback(snapshot$path),
    token = token,
    reviews = array(lapply(reviews, function(a) {
      title <- fallback(a$title)
      list(
        id = fallback(a$action_id), title = title, scope = fallback(a$scope_label),
        why = fallback(a$explanation$why_now),
        prompt = fallback(a$invocation$prompt, title),
        choices = strings(a$invocation$input$fields$choice$enum),
        summary_ids = strings(a$operator_context$focus_summary_ids),
        node_ids = strings(a$operator_context$focus_node_ids)
      )
    })),
    obligations = array(lapply(guide$obligations, function(o) list(
      title = fallback(o$title), severity = fallback(o$severity), why = fallback(o$explanation$why)
    ))),
    evidence = array(lapply(Filter(function(s) !is.null(s$summary_id), summaries), function(s) list(
      id = fallback(s$summary_id), kind = fallback(s$summary_kind), node_id = fallback(s$node_id),
      severity = fallback(s$severity), fresh = isTRUE(s$is_fresh),
      metrics = array(lapply(names(s$metrics), function(key) list(
        name = fallback(key), value = metric_value(s$metrics[[key]])
      )))
    ))),
    nodes = array(lapply(Filter(function(n) !is.null(n$id), snapshot$graph$nodes), function(n) {
      id <- fallback(n$id)
      list(id = id, label = fallback(n$label, id), kind = fallback(n$kind))
    })),
    decisions = array(lapply(snapshot$decisions, function(d) list(
      type = fallback(d$kind), choice = fallback(d$choice),
      rationale = fallback(d$rationale)
    )))
  )
}
