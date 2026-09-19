# Presentation projection for the disposable extension. Bayesgrove owns all rules.
glade_review_request <- function(handle, request) {
  guide <- bayesgrove::bg_next_actions(handle)
  snapshot <- bayesgrove::bg_snapshot(handle)
  summaries <- bayesgrove::bg_read_summaries(handle, include_stale = TRUE)
  token <- digest::digest(list(guide, snapshot$graph$version, summaries, snapshot$decisions), algo = "sha256")
  if (identical(request$kind, "decide")) {
    if (!identical(request$token, token)) stop("Evidence changed. Refresh and review it before recording a decision.")
    action <- guide$actions[[request$action_id]]
    if (is.null(action) || !identical(action$payload$template_ref, "review_decision")) {
      stop("This prototype only records review decisions. Refresh the review list.")
    }
    bayesgrove::bg_execute_action(handle, request$action_id, overrides = list(
      choice = request$choice, rationale = request$rationale
    ))
    return(glade_review_request(handle, list(kind = "snapshot")))
  }
  fallback <- function(x, default = "") if (is.null(x)) default else x
  array <- function(x) unname(as.list(x))
  reviews <- Filter(function(a) identical(a$payload$template_ref, "review_decision"), guide$actions)
  list(
    project = snapshot$name,
    path = snapshot$path,
    token = token,
    reviews = array(lapply(reviews, function(a) list(
      id = a$action_id, title = a$title, scope = a$scope_label,
      why = fallback(a$explanation$why_now),
      prompt = fallback(a$invocation$prompt, a$title),
      choices = array(a$invocation$input$fields$choice$enum),
      summary_ids = array(a$operator_context$focus_summary_ids),
      node_ids = array(a$operator_context$focus_node_ids)
    ))),
    obligations = array(lapply(guide$obligations, function(o) list(
      title = o$title, severity = o$severity, why = fallback(o$explanation$why)
    ))),
    evidence = array(lapply(summaries, function(s) list(
      id = s$summary_id, kind = s$summary_kind, node_id = s$node_id,
      severity = s$severity, fresh = isTRUE(s$is_fresh),
      metrics = array(lapply(names(s$metrics), function(key) list(
        name = key, value = as.character(jsonlite::toJSON(s$metrics[[key]], auto_unbox = TRUE))
      )))
    ))),
    nodes = array(lapply(snapshot$graph$nodes, function(n) list(
      id = n$id, label = fallback(n$label, n$id), kind = n$kind
    ))),
    decisions = array(lapply(snapshot$decisions, function(d) list(
      type = fallback(d$kind), choice = fallback(d$choice),
      rationale = fallback(d$rationale)
    )))
  )
}
