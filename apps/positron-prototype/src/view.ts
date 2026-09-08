import type { ReviewSnapshot } from './contracts';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function render(snapshot: ReviewSnapshot | undefined, busy: boolean, notice: string, handle: string, nonce: string, sessionId: string) {
  const data = JSON.stringify(snapshot ?? null).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
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
label { display:block; margin:14px 0 6px; font-weight:550; } select, textarea { box-sizing:border-box; width:100%; background:var(--vscode-input-background,#f6f7f8); color:var(--vscode-input-foreground,#252b32); border:1px solid var(--vscode-input-border,#cbd1d6); border-radius:2px; padding:9px; } textarea { min-height:105px; resize:vertical; }
form { max-width:700px; margin-top:24px; padding-top:12px; border-top:1px solid var(--vscode-panel-border,#ddd); } form button { margin-top:14px; }
table { border-collapse:collapse; width:100%; } td,th { padding:7px 10px; text-align:left; border-bottom:1px solid var(--vscode-panel-border,#ddd); } td:last-child { text-align:right; font-variant-numeric:tabular-nums; } th { font-weight:500; }
.evidence { border-left:3px solid var(--vscode-editorWarning-foreground,#b58b23); padding:0 0 10px 14px; margin:20px 0; } .notice { padding:10px 28px; background:var(--vscode-textBlockQuote-background,#edf2f6); min-height:20px; } .toolbar { display:flex; justify-content:space-between; align-items:center; gap:15px; }
details { margin-top:24px; } summary { cursor:pointer; } .decision { margin:14px 0; padding-left:12px; border-left:2px solid var(--vscode-panel-border,#ddd); }
@media(max-width:640px) { .layout { grid-template-columns:1fr; } nav { border-right:0; border-bottom:1px solid var(--vscode-panel-border,#ddd); } main, header { padding:18px; } }
</style></head><body>
<header><div class="toolbar"><span class="subtle">Glade review prototype</span><button id="refresh" ${busy ? 'disabled' : ''}>Refresh from R</button></div>
<h1>${escape(snapshot?.project ?? 'Attach to Bayesgrove')}</h1>
<p class="subtle">Inspect the evidence, then record what it means for your analysis.</p>
<div class="path subtle">${escape(snapshot?.path ?? '')} ${snapshot ? `• R object: ${escape(handle)}` : ''}</div></header>
<div class="notice" role="status">${escape(busy ? 'Waiting for the attached R session…' : notice)}</div>
<div class="layout"><nav aria-label="Pending reviews"><h3>Pending reviews</h3><div id="reviews"></div><details><summary>Workflow context</summary><div id="context"></div></details></nav><main id="detail"></main></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const snapshot = ${data};
const busy = ${busy};
const attachment = ${JSON.stringify(JSON.stringify([sessionId, handle, snapshot?.path ?? ""]))};
const stored = vscode.getState();
const saved = stored?.attachment === attachment ? stored : { attachment };
vscode.setState(saved);
if (${JSON.stringify(notice.startsWith('Decision recorded'))}) { saved.draft = null; vscode.setState(saved); }
const element = (tag, text, className) => { const e = document.createElement(tag); if (text) e.textContent = text; if(className) e.className = className; return e; };
const main = document.getElementById('detail');
document.getElementById('refresh').onclick = () => vscode.postMessage({kind:'snapshot'});
function evidence(parent, review) {
  const relevant = snapshot.evidence.filter(s => !review || review.summary_ids.includes(s.id) || review.node_ids.includes(s.node_id));
  if (!relevant.length) parent.append(element('p','No summary evidence is attached to this review. Inspect the model in R before deciding.','subtle'));
  for(const s of relevant) {
    const section=element('section',null,'evidence');
    const node=snapshot.nodes.find(n=>n.id===s.node_id);
    section.append(element('h3',(node ? node.label : s.node_id)+' / '+s.kind.replaceAll('_',' ')));
    section.append(element('p',s.severity+' • '+(s.fresh?'Fresh at last refresh':'Stale at last refresh'),'subtle'));
    const table=element('table'); const body=element('tbody');
    for(const metric of s.metrics) { const row=element('tr'); row.append(element('th',metric.name.replaceAll('_',' ')),element('td',metric.value)); body.append(row); }
    table.append(body); section.append(table); parent.append(section);
  }
}
function history(parent) {
  const details=element('details'); details.open=true; details.append(element('summary','Recorded decisions ('+snapshot.decisions.length+')'));
  for(const d of snapshot.decisions) { const entry=element('div',null,'decision'); entry.append(element('strong',d.type.replaceAll('_',' ')+': '+d.choice.replaceAll('_',' ')),element('p',d.rationale)); details.append(entry); }
  parent.append(details);
}
function select(review) {
  main.replaceChildren();
  for(const b of document.querySelectorAll('nav button')) b.setAttribute('aria-pressed',String(b.dataset.id===review?.id));
  if (!snapshot) { main.append(element('p','Open a Bayesgrove handle in R, then attach Glade to that object.')); return; }
  if (!review) {
    main.append(element('h2','No pending review decisions'),element('p','This does not establish that the model is adequate. Bayesgrove reports no review action for the current project scope.','subtle'));
    evidence(main); history(main); return;
  }
  saved.selected=review.id; vscode.setState(saved);
  main.append(element('h2',review.title),element('p',review.why)); evidence(main,review);
  const form=element('form'); form.append(element('h3',review.prompt));
  const choiceLabel=element('label','Decision'); choiceLabel.htmlFor='choice';
  const choice=element('select'); choice.id='choice'; choice.required=true;
  const placeholder=element('option','Choose after reviewing the evidence'); placeholder.value=''; choice.append(placeholder);
  for(const value of review.choices) { const option=element('option',value.replaceAll('_',' ')); option.value=value; choice.append(option); }
  const rationaleLabel=element('label','Rationale'); rationaleLabel.htmlFor='rationale';
  const rationale=element('textarea'); rationale.id='rationale'; rationale.required=true; rationale.placeholder='What did you learn, and what should happen next?';
  if(saved.draft?.id===review.id) { choice.value=saved.draft.choice; rationale.value=saved.draft.rationale; }
  const save=()=>{saved.draft={id:review.id,choice:choice.value,rationale:rationale.value};vscode.setState(saved);}; choice.onchange=save; rationale.oninput=save;
  const submit=element('button','Record decision in Bayesgrove'); submit.type='submit'; submit.disabled=busy || review.choices.length===0;
  form.append(choiceLabel,choice,rationaleLabel,rationale,submit);
  form.onsubmit=(event)=>{event.preventDefault(); if(!rationale.value.trim()) {rationale.focus();return;} save(); vscode.postMessage({kind:'decide',token:snapshot.token,action_id:review.id,choice:choice.value,rationale:rationale.value.trim()});};
  main.append(form); history(main);
}
if(snapshot) {
  for(const review of snapshot.reviews) { const button=element('button',review.title); button.dataset.id=review.id; button.onclick=()=>select(review); button.disabled=busy; document.getElementById('reviews').append(button); }
  const context=document.getElementById('context');
  for(const o of snapshot.obligations) context.append(element('p',o.severity+': '+o.title));
  for(const n of snapshot.nodes) context.append(element('p',n.label+' ('+n.kind+')','subtle'));
}
select(snapshot?.reviews.find(r=>r.id===saved.selected) || snapshot?.reviews[0]);
</script></body></html>`;
}
