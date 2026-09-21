// The panel is a persistent document. extension.ts sets this shell once per
// panel and then delivers every later state as a postMessage payload that the
// boot script at the end of the body applies to the DOM in place, so keyboard
// focus, scroll position, and the role="status" live region survive refreshes
// and decisions. All dynamic content is attached with textContent; no state
// string is ever interpolated as HTML.
export const renderShell = (nonce: string): string => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
body { margin:0; color:var(--vscode-editor-foreground,#252b32); background:var(--vscode-editor-background,#fff); font:var(--vscode-font-size,13px)/1.55 var(--vscode-font-family,system-ui); }
header { padding:24px 28px 16px; border-bottom:1px solid var(--vscode-panel-border,#ddd); }
h1 { font-size:23px; font-weight:550; margin:5px 0; } h2 { font-size:19px; font-weight:550; margin:0 0 10px; } h3 { font-size:14px; margin:18px 0 8px; }
p { max-width:76ch; margin:6px 0 12px; } .subtle { color:var(--vscode-descriptionForeground,#66717b); } .path { overflow-wrap:anywhere; font-size:11px; }
.layout { display:grid; grid-template-columns:minmax(190px, 27%) 1fr; min-height:450px; } nav { padding:22px 16px; border-right:1px solid var(--vscode-panel-border,#ddd); } main { padding:22px 28px; max-width:900px; }
button, select, textarea { font:inherit; } button { cursor:pointer; border:0; padding:7px 12px; background:var(--vscode-button-background,#235b87); color:var(--vscode-button-foreground,#fff); border-radius:3px; }
button:disabled { opacity:.5; cursor:wait; } button:focus-visible, textarea:focus, select:focus { outline:2px solid var(--vscode-focusBorder,#2679b7); outline-offset:2px; }
nav button { display:block; width:100%; text-align:left; margin:4px 0; padding:12px; background:transparent; color:inherit; border-left:3px solid transparent; border-radius:0; } nav button[aria-pressed=true] { background:var(--vscode-list-activeSelectionBackground,#e7eff6); color:var(--vscode-list-activeSelectionForeground,#163d60); border-color:var(--vscode-focusBorder,#2679b7); }
.scope { display:block; font-size:11px; font-weight:400; opacity:.75; }
label { display:block; margin:14px 0 6px; font-weight:550; } select, textarea { box-sizing:border-box; width:100%; background:var(--vscode-input-background,#f6f7f8); color:var(--vscode-input-foreground,#252b32); border:1px solid var(--vscode-input-border,#cbd1d6); border-radius:2px; padding:9px; } textarea { min-height:105px; resize:vertical; }
form { max-width:700px; margin-top:24px; padding-top:12px; border-top:1px solid var(--vscode-panel-border,#ddd); } form button { margin-top:14px; }
table { border-collapse:collapse; width:100%; } td,th { padding:7px 10px; text-align:left; border-bottom:1px solid var(--vscode-panel-border,#ddd); } td:last-child { text-align:right; font-variant-numeric:tabular-nums; } th { font-weight:500; }
.evidence { border-left:3px solid var(--vscode-editorWarning-foreground,#b58b23); padding:0 0 10px 14px; margin:20px 0; } .notice { padding:10px 28px; background:var(--vscode-textBlockQuote-background,#edf2f6); min-height:20px; } .toolbar { display:flex; justify-content:space-between; align-items:center; gap:15px; }
details { margin-top:24px; } summary { cursor:pointer; } .decision { margin:14px 0; padding-left:12px; border-left:2px solid var(--vscode-panel-border,#ddd); }
@media(max-width:640px) { .layout { grid-template-columns:1fr; } nav { border-right:0; border-bottom:1px solid var(--vscode-panel-border,#ddd); } main, header { padding:18px; } }
</style></head><body>
<header><div class="toolbar"><span class="subtle">Glade review prototype</span><button id="refresh">Refresh from R</button></div>
<h1 id="project">Attach to Bayesgrove</h1>
<p class="subtle">Inspect the evidence, then record what it means for your analysis.</p>
<div class="path subtle" id="path"></div></header>
<div class="notice" role="status" id="notice"></div>
<div class="layout"><nav aria-label="Pending reviews"><h3>Pending reviews</h3><div id="reviews"></div><details><summary>Workflow context</summary><div id="context"></div></details></nav><main id="detail"></main></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const element = (tag, text, className) => { const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e; };
const main = document.getElementById('detail');
const reviews = document.getElementById('reviews');
const context = document.getElementById('context');
const noticeNode = document.getElementById('notice');
const refresh = document.getElementById('refresh');
let current = null;
let saved = null;
let form = null;
let navKey;
let contextKey;
let builtToken;
let builtReviewId;
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const selected = () => current && current.snapshot ? (current.snapshot.reviews.find((r) => r.id === saved.selected) || current.snapshot.reviews[0]) : undefined;
// Applies update() while preserving what a document replacement used to
// destroy: scroll positions of the scrolling containers, and keyboard focus
// when the focused element itself was removed (matched afterwards by id or
// data-focus so a rebuilt region hands focus to its own replacement).
const scrollers = () => [document.scrollingElement, document.querySelector('nav'), main];
const preserve = (update) => {
  const active = document.activeElement;
  const key = active instanceof HTMLElement ? (active.id || active.dataset.focus) : undefined;
  const before = scrollers().map((node) => node ? node.scrollTop : 0);
  update();
  scrollers().forEach((node, index) => { if (node && node.scrollTop !== before[index]) node.scrollTop = before[index]; });
  if (key && !(active && active.isConnected)) {
    const target = document.getElementById(key) || document.querySelector('[data-focus="' + key + '"]');
    if (target) target.focus();
  }
};
const evidence = (out, snapshot, review) => {
  const relevant = snapshot.evidence.filter((s) => !review || review.summary_ids.includes(s.id) || review.node_ids.includes(s.node_id));
  if (!relevant.length) out.push(element('p', 'No summary evidence is attached to this review. Inspect the model in R before deciding.', 'subtle'));
  for (const s of relevant) {
    const section = element('section', null, 'evidence');
    const node = snapshot.nodes.find((n) => n.id === s.node_id);
    section.append(element('h3', (node ? node.label : s.node_id) + ' / ' + s.kind.replaceAll('_', ' ')));
    section.append(element('p', s.severity + ' • ' + (s.fresh ? 'Fresh at last refresh' : 'Stale at last refresh'), 'subtle'));
    const table = element('table'); const body = element('tbody');
    for (const metric of s.metrics) { const row = element('tr'); row.append(element('th', metric.name.replaceAll('_', ' ')), element('td', metric.value)); body.append(row); }
    table.append(body); section.append(table); out.push(section);
  }
};
const history = (out, snapshot) => {
  const details = element('details'); details.open = true; details.append(element('summary', 'Recorded decisions (' + snapshot.decisions.length + ')'));
  for (const d of snapshot.decisions) { const entry = element('div', null, 'decision'); entry.append(element('strong', d.type.replaceAll('_', ' ') + ': ' + d.choice.replaceAll('_', ' ')), element('p', d.rationale)); details.append(entry); }
  out.push(details);
};
const renderNav = (state) => {
  const token = state.snapshot ? state.snapshot.token : undefined;
  if (token !== navKey) {
    navKey = token;
    const buttons = [];
    if (state.snapshot) for (const review of state.snapshot.reviews) {
      const button = element('button');
      if (review.scope) button.append(element('span', review.title), element('span', review.scope, 'scope')); else button.textContent = review.title;
      button.dataset.id = review.id;
      button.dataset.focus = 'review:' + review.id;
      button.disabled = state.busy;
      button.onclick = () => select(review);
      buttons.push(button);
    }
    reviews.replaceChildren(...buttons);
  } else for (const button of reviews.querySelectorAll('button')) button.disabled = state.busy;
  const selectedId = selected()?.id;
  for (const button of reviews.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selectedId));
};
const renderContext = (state) => {
  const token = state.snapshot ? state.snapshot.token : undefined;
  if (token === contextKey) return;
  contextKey = token;
  const entries = [];
  if (state.snapshot) {
    for (const o of state.snapshot.obligations) { const entry = element('p', o.severity + ': ' + o.title); if (o.why) entry.append(element('span', o.why, 'scope')); entries.push(entry); }
    for (const n of state.snapshot.nodes) entries.push(element('p', n.label + ' (' + n.kind + ')', 'subtle'));
  }
  context.replaceChildren(...entries);
};
// Rebuilds the detail region. Regions keyed by the snapshot token (nav,
// context) skip rebuilds when nothing changed, and a mounted decision form is
// left mounted unless the token or the selected review moved, so typing
// survives busy updates; the recorded flag always rebuilds so a decided form
// comes back empty as before. The persisted draft is restored only for the
// review it belongs to, with the choice validated against the review's
// choices.
const buildDetail = (state, review) => {
  const snapshot = state.snapshot;
  builtToken = snapshot ? snapshot.token : undefined;
  builtReviewId = review ? review.id : undefined;
  form = null;
  const parts = [];
  const selectedId = review ? review.id : undefined;
  for (const button of reviews.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === selectedId));
  if (!snapshot) parts.push(element('p', 'Open a Bayesgrove handle in R, then attach Glade to that object.'));
  else if (!review) {
    parts.push(element('h2', 'No pending review decisions'));
    parts.push(element('p', 'This does not establish that the model is adequate. Bayesgrove reports no review action for the current project scope.', 'subtle'));
    evidence(parts, snapshot); history(parts, snapshot);
  } else {
    parts.push(element('h2', review.title));
    if (review.scope) parts.push(element('p', review.scope, 'subtle'));
    parts.push(element('p', review.why));
    evidence(parts, snapshot, review);
    const box = element('form');
    box.append(element('h3', review.prompt));
    const choiceLabel = element('label', 'Decision'); choiceLabel.htmlFor = 'choice';
    const choice = element('select'); choice.id = 'choice'; choice.required = true;
    const placeholder = element('option', 'Choose after reviewing the evidence'); placeholder.value = ''; choice.append(placeholder);
    for (const value of review.choices) { const option = element('option', value.replaceAll('_', ' ')); option.value = value; choice.append(option); }
    const rationaleLabel = element('label', 'Rationale'); rationaleLabel.htmlFor = 'rationale';
    const rationale = element('textarea'); rationale.id = 'rationale'; rationale.required = true; rationale.placeholder = 'What did you learn, and what should happen next?';
    if (saved.draft?.id === review.id) { if (review.choices.includes(saved.draft.choice)) choice.value = saved.draft.choice; rationale.value = saved.draft.rationale; }
    const save = () => { saved.draft = { id: review.id, choice: choice.value, rationale: rationale.value }; vscode.setState(saved); };
    choice.onchange = save; rationale.oninput = save;
    const submit = element('button', 'Record decision in Bayesgrove'); submit.type = 'submit'; submit.disabled = state.busy || review.choices.length === 0;
    box.append(choiceLabel, choice, rationaleLabel, rationale, submit);
    box.onsubmit = (event) => { event.preventDefault(); if (!rationale.value.trim()) { rationale.focus(); return; } save(); vscode.postMessage({ kind: 'decide', token: snapshot.token, action_id: review.id, choice: choice.value, rationale: rationale.value.trim() }); };
    form = { choice: choice, rationale: rationale, submit: submit };
    parts.push(box);
    history(parts, snapshot);
  }
  main.replaceChildren(...parts);
};
const select = (review) => {
  if (!current) return;
  saved.selected = review.id; vscode.setState(saved);
  preserve(() => buildDetail(current, review));
};
const renderDetail = (state) => {
  const review = selected();
  const token = state.snapshot ? state.snapshot.token : undefined;
  if (!state.recorded && form && builtToken === token && builtReviewId === (review ? review.id : undefined)) {
    form.submit.disabled = state.busy || review.choices.length === 0;
    return;
  }
  buildDetail(state, review);
};
// Rebases the persisted state onto this message's [sessionId, handle]
// attachment and clears the draft when the decision was recorded. Busy
// updates carry recorded=false and leave drafts alone.
const rebase = (state) => {
  const attachment = JSON.stringify([state.sessionId, state.handle]);
  const stored = vscode.getState();
  saved = stored && stored.attachment === attachment ? stored : { attachment: attachment };
  vscode.setState(saved);
  if (state.recorded) { saved.draft = null; vscode.setState(saved); }
};
const applyState = (state) => {
  current = state;
  rebase(state);
  preserve(() => {
    setText(noticeNode, state.notice || (state.busy ? 'Waiting for the attached R session…' : ''));
    refresh.disabled = state.busy;
    setText(document.getElementById('project'), state.snapshot ? state.snapshot.project : 'Attach to Bayesgrove');
    setText(document.getElementById('path'), state.snapshot ? state.snapshot.path + ' • R object: ' + state.handle : '');
    renderNav(state);
    renderContext(state);
    renderDetail(state);
  });
};
window.addEventListener('message', (event) => { applyState(event.data); });
vscode.postMessage({ kind: 'ready' });
refresh.onclick = () => vscode.postMessage({ kind: 'snapshot' });
</script></body></html>`;
