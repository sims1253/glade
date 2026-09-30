import { describe, expect, test } from 'bun:test';
import { Event, HTMLButtonElement, HTMLFormElement, HTMLSelectElement, HTMLTextAreaElement, Window } from 'happy-dom';
import { renderShell } from './view';
import type { ReviewSnapshot } from './contracts';

// Regression suite for the panel draft lifecycle: a successful decision
// completion must be consumed exactly once, so a replayed state (the ready
// handshake after a reload, or a busy redelivery) can never clear a draft
// written after that decision. The panel boots the exact shell the extension
// ships: the DOM comes from renderShell, and the inline boot script runs
// unmodified with the webview-host globals it references supplied as
// parameters, exactly as the review probe executed the previous initializer.

type Review = ReviewSnapshot['reviews'][number];
type Draft = { id: string; choice: string; rationale: string };
type Persisted = { attachment: string; draft?: Draft | null; consumedDecision?: string; selected?: string };
type OutboundMessage =
  | { kind: 'ready' }
  | { kind: 'snapshot' }
  | { kind: 'decide'; token: string; action_id: string; choice: string; rationale: string };
type PanelState = {
  snapshot: ReviewSnapshot | undefined;
  busy: boolean;
  notice: string;
  handle: string;
  sessionId: string;
  decision: string | undefined;
};
type Store = { value: Persisted | undefined };
type VscodeApi = {
  getState: () => Persisted | undefined;
  setState: (state: Persisted) => void;
  postMessage: (message: OutboundMessage) => void;
};
type Panel = { window: Window; posted: OutboundMessage[]; send: (message: PanelState) => void };

const NONCE = 'e2a1c5f9b3d7';
const SESSION = 'session-1';
const HANDLE = 'glade_prototype';
const RECORDED_NOTICE = 'Decision recorded in Bayesgrove. The review list has been refreshed.';
const REFRESH_FAILED_NOTICE = 'Decision recorded in Bayesgrove, but the refreshed evidence could not be loaded: the projection failed. Refresh from R when it is available.';

// happy-dom does not export MessageEvent; the boot script only reads
// event.data, so a message event is an Event carrying that one field.
class StateMessageEvent extends Event {
  readonly data: PanelState;

  constructor(data: PanelState) {
    super('message');
    this.data = data;
  }
}

// Boots a fresh window on the same persisted store. Recreating the panel for a
// store is the documented webview reload: the same HTML runs again and VS Code
// restores getState(), which is what let the old success predicate clear newer
// drafts.
const bootPanel = (store: Store): Panel => {
  const window = new Window({ url: 'https://prototype.test/' });
  const posted: OutboundMessage[] = [];
  const api: VscodeApi = {
    getState: () => store.value,
    setState: (state) => { store.value = state; },
    postMessage: (message) => { posted.push(message); },
  };
  window.document.write(renderShell(NONCE));
  const source = window.document.querySelector('script')?.textContent ?? '';
  const boot = new Function('window', 'document', 'HTMLElement', 'acquireVsCodeApi', 'requestAnimationFrame', 'cancelAnimationFrame', source);
  boot(window, window.document, window.HTMLElement, () => api, window.requestAnimationFrame.bind(window), window.cancelAnimationFrame.bind(window));
  return { window, posted, send: (message) => { window.dispatchEvent(new StateMessageEvent(message)); } };
};

const review = (id: string, choices: string[]): Review => ({
  id,
  title: `Review ${id}`,
  scope: '',
  why: `Why ${id} matters.`,
  prompt: 'Record what the evidence means.',
  choices,
  summary_ids: [],
  node_ids: [],
});

const snapshotFor = (token: string, reviews: Review[]): ReviewSnapshot => ({
  project: 'Scratch analysis',
  path: '/tmp/glade-scratch',
  token,
  reviews,
  obligations: [],
  evidence: [],
  nodes: [],
  decisions: [],
});

const state = (snapshot: ReviewSnapshot | undefined): PanelState => ({
  snapshot,
  busy: false,
  notice: '',
  handle: HANDLE,
  sessionId: SESSION,
  decision: undefined,
});

const choiceField = (window: Window): HTMLSelectElement => {
  const field = window.document.getElementById('choice');
  if (!(field instanceof HTMLSelectElement)) throw new Error('decision select is not mounted');
  return field;
};

const rationaleField = (window: Window): HTMLTextAreaElement => {
  const field = window.document.getElementById('rationale');
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('rationale textarea is not mounted');
  return field;
};

const submitButton = (window: Window): HTMLButtonElement => {
  const button = window.document.querySelector('main form button');
  if (!(button instanceof HTMLButtonElement)) throw new Error('submit button is not mounted');
  return button;
};

const choose = (window: Window, value: string): void => {
  const field = choiceField(window);
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
};

const typeRationale = (window: Window, text: string): void => {
  const field = rationaleField(window);
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};

const openReview = (window: Window, id: string): void => {
  for (const node of window.document.querySelectorAll('nav button')) {
    if (node instanceof HTMLButtonElement && node.dataset.id === id) {
      node.click();
      return;
    }
  }
  throw new Error(`nav button for ${id} is not mounted`);
};

const submitDecision = (window: Window): void => {
  const form = window.document.querySelector('main form');
  if (!(form instanceof HTMLFormElement)) throw new Error('decision form is not mounted');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

const navButtonCount = (window: Window): number => window.document.querySelectorAll('nav button').length;

describe('prototype panel draft lifecycle', () => {
  test('a replayed decision completion never clears a draft written afterwards', () => {
    const store: Store = { value: undefined };
    const panel = bootPanel(store);
    const reviewA = review('review-A', ['accept', 'revise']);
    const reviewB = review('review-B', ['accept', 'revise']);
    expect(panel.posted).toEqual([{ kind: 'ready' }]);
    panel.send(state(snapshotFor('t1', [reviewA, reviewB])));
    // Decide review A successfully; the refreshed list no longer offers it.
    choose(panel.window, 'accept');
    typeRationale(panel.window, 'converged diagnostics, keep the sampler');
    submitDecision(panel.window);
    expect(panel.posted[1]).toEqual({
      kind: 'decide',
      token: 't1',
      action_id: 'review-A',
      choice: 'accept',
      rationale: 'converged diagnostics, keep the sampler',
    });
    const afterDecision = snapshotFor('t2', [reviewB]);
    panel.send({ ...state(afterDecision), decision: 'd1', notice: RECORDED_NOTICE });
    expect(store.value?.draft).toBeNull();
    expect(store.value?.consumedDecision).toBe('d1');
    expect(navButtonCount(panel.window)).toBe(1);
    // The researcher then writes a draft for review B.
    openReview(panel.window, 'review-B');
    typeRationale(panel.window, 'keep this newer rationale');
    expect(store.value?.draft).toEqual({ id: 'review-B', choice: '', rationale: 'keep this newer rationale' });
    // The panel is recreated: same HTML, same persisted state, and the ready
    // handshake redelivers the very same decision completion.
    const restored = bootPanel(store);
    expect(restored.posted).toEqual([{ kind: 'ready' }]);
    restored.send({ ...state(afterDecision), decision: 'd1', notice: RECORDED_NOTICE });
    expect(rationaleField(restored.window).value).toBe('keep this newer rationale');
    expect(choiceField(restored.window).value).toBe('');
    expect(store.value?.draft).toEqual({ id: 'review-B', choice: '', rationale: 'keep this newer rationale' });
  });

  test('a busy redelivery of the same decision leaves the mounted draft alone', () => {
    const store: Store = { value: undefined };
    const panel = bootPanel(store);
    const reviewA = review('review-A', ['accept', 'revise']);
    const reviewB = review('review-B', ['accept', 'revise']);
    const afterDecision = snapshotFor('t2', [reviewB]);
    panel.send(state(snapshotFor('t1', [reviewA, reviewB])));
    choose(panel.window, 'accept');
    typeRationale(panel.window, 'first decision');
    panel.send({ ...state(afterDecision), decision: 'd1', notice: RECORDED_NOTICE });
    openReview(panel.window, 'review-B');
    typeRationale(panel.window, 'still thinking about B');
    panel.send({ ...state(afterDecision), busy: true, decision: 'd1' });
    expect(rationaleField(panel.window).value).toBe('still thinking about B');
    expect(store.value?.draft?.rationale).toBe('still thinking about B');
    expect(submitButton(panel.window).disabled).toBe(true);
  });

  test('a failed decide keeps the draft it was submitting', () => {
    const store: Store = { value: undefined };
    const panel = bootPanel(store);
    const reviews = [review('review-A', ['accept', 'revise']), review('review-B', ['accept'])];
    const withReviews = snapshotFor('t1', reviews);
    panel.send(state(withReviews));
    choose(panel.window, 'revise');
    typeRationale(panel.window, 'divergent chains, rerun');
    panel.send({ ...state(withReviews), notice: 'R did not respond within 60 seconds. A decision may still have been recorded. Check the R console, then refresh before deciding again.' });
    expect(store.value?.draft).toEqual({ id: 'review-A', choice: 'revise', rationale: 'divergent chains, rerun' });
    expect(choiceField(panel.window).value).toBe('revise');
    expect(rationaleField(panel.window).value).toBe('divergent chains, rerun');
  });

  test('reattaching to a different session drops the old draft and the stale form', () => {
    const store: Store = {
      value: { attachment: JSON.stringify([SESSION, HANDLE]), draft: { id: 'review-A', choice: 'accept', rationale: 'old project draft' }, selected: 'review-A' },
    };
    const panel = bootPanel(store);
    // Same attachment: the persisted draft is restored into the form.
    panel.send(state(snapshotFor('t1', [review('review-A', ['accept', 'revise'])])));
    expect(rationaleField(panel.window).value).toBe('old project draft');
    // Reattach flow: the extension resets the snapshot together with the session.
    panel.send({ ...state(undefined), sessionId: 'session-2', notice: 'Refreshed from the attached R session.' });
    expect(store.value).toEqual({ attachment: JSON.stringify(['session-2', HANDLE]) });
    expect(navButtonCount(panel.window)).toBe(0);
    expect(panel.window.document.querySelector('main form')).toBeNull();
  });

  test('a restored draft choice missing from the refreshed choices is not preselected', () => {
    const store: Store = {
      value: { attachment: JSON.stringify([SESSION, HANDLE]), draft: { id: 'review-A', choice: 'accept', rationale: 'typed before the refresh' } },
    };
    const panel = bootPanel(store);
    panel.send(state(snapshotFor('t2', [review('review-A', ['revise', 'reject'])])));
    expect(choiceField(panel.window).value).toBe('');
    expect(rationaleField(panel.window).value).toBe('typed before the refresh');
  });

  test('a decision whose refresh failed still consumes its completion once', () => {
    const store: Store = { value: undefined };
    const panel = bootPanel(store);
    const reviewA = review('review-A', ['accept', 'revise']);
    const reviewB = review('review-B', ['accept']);
    const previous = snapshotFor('t1', [reviewA, reviewB]);
    panel.send(state(previous));
    choose(panel.window, 'accept');
    typeRationale(panel.window, 'recorded but the projection failed');
    panel.send({ ...state(previous), decision: 'd9', notice: REFRESH_FAILED_NOTICE });
    expect(store.value?.consumedDecision).toBe('d9');
    expect(store.value?.draft).toBeNull();
    // The previous snapshot stays, so review B is still offered.
    openReview(panel.window, 'review-B');
    typeRationale(panel.window, 'draft after the partial failure');
    const restored = bootPanel(store);
    restored.send({ ...state(previous), decision: 'd9', notice: REFRESH_FAILED_NOTICE });
    expect(rationaleField(restored.window).value).toBe('draft after the partial failure');
  });
});
