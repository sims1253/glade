import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { Effect, Option, ParseResult, Schema } from 'effect';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { BridgeResponse, HandleName, Request, ReviewSnapshot } from './contracts';
import { renderShell } from './view';

// A failure ready for the notice bar: short text a researcher can act on, with
// the raw internal dump (parse trees, host errors) kept for the extension host
// log instead of the panel.
export type Failure = { readonly message: string; readonly detail?: unknown };

// Effect.tryPromise wraps host rejections in an UnknownException box carrying
// the original value; the box itself never reaches the notice bar.
const WrappedRejection = Schema.Struct({ _tag: Schema.Literal('UnknownException'), error: Schema.Unknown });
const MessageCarrier = Schema.Struct({ message: Schema.String });
// Transport plumbing, not a bridge request: the panel's boot script answers
// with this once its message listener exists, because state posted to a
// document that is still loading would be dropped.
const ReadyMessage = Schema.Struct({ kind: Schema.Literal('ready') });

const hostFailure = (message: string): Failure => {
  if (/(?:bridge|scratch)\.R/.test(message)) {
    return {
      message: 'The prototype could not read the R script it ships with. Rebuild or reinstall the extension, then try again.',
      detail: message,
    };
  }
  if (/\bbusy\b/i.test(message)) {
    return {
      message: 'R is still busy finishing a previous evaluation. Wait for it to finish, then try again.',
      detail: message,
    };
  }
  return { message };
};

// Maps every failure this extension produces to notice-bar text: plain string
// failures pass through, Error-like values contribute their message, and
// anything unclassified gets fixed generic copy while the raw value goes to
// the extension host log, so no internal dump reaches the notice bar.
export const describeFailure = (cause: unknown): Failure => {
  const unwrapped = Schema.decodeUnknownOption(WrappedRejection)(cause);
  if (Option.isSome(unwrapped)) return describeFailure(unwrapped.value.error);
  const text = Schema.decodeUnknownOption(Schema.String)(cause);
  if (Option.isSome(text)) return { message: text.value };
  if (ParseResult.isParseError(cause)) {
    return { message: 'The prototype received a message it could not read. Reload the panel and try again.', detail: cause };
  }
  const carrier = Schema.decodeUnknownOption(MessageCarrier)(cause);
  if (Option.isSome(carrier)) return hostFailure(carrier.value.message);
  return { message: 'The prototype hit an unexpected condition. Details are in the extension host log.', detail: cause };
};

const unreadableResponse = (cause: unknown): string => {
  console.warn('Glade prototype: unreadable response:', cause);
  return 'The attached project returned data this prototype cannot read. Check the R console; details are in the extension host log.';
};

// The R-side refresh reason can span lines and carry an internal dump; the
// notice keeps one capped line, and the caller logs the raw value.
const summarizeRefreshError = (error: string): string => {
  const line = error.split('\n')[0]?.trim() ?? '';
  if (!line) return 'no reason was reported';
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
};

export function activate(context: vscode.ExtensionContext) {
  const api = tryAcquirePositronApi();
  let panel: vscode.WebviewPanel | undefined;
  let handleName = 'glade_prototype';
  let sessionId = '';
  let snapshot: ReviewSnapshot | undefined;
  let busy = false;
  // The panel is a persistent document: the shell is set once per panel and
  // every later state change travels as a postMessage payload. The last
  // notice and decision id are kept so the ready handshake can redeliver
  // the latest state after the shell loads or the webview reloads.
  let shellSent = false;
  let lastNotice = '';
  let lastDecision: string | undefined;
  const pushState = () => {
    if (panel && shellSent) void panel.webview.postMessage({ snapshot, busy, notice: lastNotice, handle: handleName, sessionId, decision: lastDecision });
  };
  const show = (notice = '', decision?: string) => {
    lastNotice = notice;
    lastDecision = decision;
    if (!panel) return;
    if (!shellSent) {
      shellSent = true;
      panel.webview.html = renderShell(randomBytes(16).toString('hex'));
      return;
    }
    pushState();
  };
  const report = (failure: Failure) => {
    if (failure.detail !== undefined) console.warn('Glade prototype:', failure.detail);
    // Even a broken render must not hide what happened; fall back to a toast.
    try {
      if (panel) show(failure.message);
      else void vscode.window.showErrorMessage(failure.message);
    } catch {
      void vscode.window.showErrorMessage(failure.message);
    }
  };
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(
    Effect.catchAll((cause) => Effect.sync(() => report(describeFailure(cause)))),
    // Defects (for example a throw inside a render) are not failures; catch
    // them too so the crash is reported and busy cannot stay wedged. The
    // notice stays generic — the defect itself goes to the log via `detail`.
    Effect.catchAllDefect((defect) => Effect.sync(() => report({
      message: 'The prototype hit an unexpected condition. Details are in the extension host log.',
      detail: defect,
    }))),
  ));
  const request = (message: Request) => Effect.gen(function* () {
    if (!api) return yield* Effect.fail('Open this prototype in Positron. VS Code session support is not implemented.');
    if (busy) {
      show('A previous request is still in progress. Wait for it to finish.');
      return;
    }
    const attachedSessionId = sessionId;
    const attachedHandleName = handleName;
    let notice = 'Refreshed from the attached R session.';
    let decision: string | undefined;
    yield* Effect.gen(function* () {
      busy = true;
      show();
      const session = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.getSession(attachedSessionId)));
      if (!session || session.runtimeMetadata.languageId !== 'r') {
        snapshot = undefined;
        return yield* Effect.fail('The attached R session ended. Open the prototype again to attach to a session.');
      }
      const bridge = yield* Effect.tryPromise(() => readFile(context.asAbsolutePath('r/bridge.R'), 'utf8'));
      const code = `local({${bridge}\n if (!exists(${JSON.stringify(attachedHandleName)}, envir = .GlobalEnv, inherits = FALSE)) stop("The attached R object is missing. Reopen the project in R, then attach Glade again."); as.character(jsonlite::toJSON(glade_review_request(get(${JSON.stringify(attachedHandleName)}, envir = .GlobalEnv), jsonlite::fromJSON(${JSON.stringify(JSON.stringify(message))})), auto_unbox = TRUE, null = "null")) })`;
      const result = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.evaluateCode(
        'r', code, undefined, attachedSessionId, api.RuntimeBusyBehavior.Reject,
      )));
      const json = yield* Schema.decodeUnknown(Schema.String)(result.result).pipe(Effect.mapError(unreadableResponse));
      const response = yield* Schema.decodeUnknown(Schema.parseJson(BridgeResponse))(json).pipe(Effect.mapError(unreadableResponse));
      // Only a decide whose refreshed projection failed carries a null snapshot:
      // the decision is already recorded in Bayesgrove, so keep the previous
      // snapshot and never re-issue the decide — a retry would record it twice.
      if (response.snapshot === null) {
        console.warn('Glade prototype: decision recorded but the refreshed evidence failed to load:', response.refresh_error);
        notice = `Decision recorded in Bayesgrove, but the refreshed evidence could not be loaded: ${summarizeRefreshError(response.refresh_error)}. Refresh from R when it is available.`;
        decision = randomBytes(8).toString('hex');
        return;
      }
      snapshot = response.snapshot;
      if (response.kind === 'decided') {
        notice = 'Decision recorded in Bayesgrove. The review list has been refreshed.';
        decision = randomBytes(8).toString('hex');
      }
    }).pipe(
      Effect.timeoutFail({
        duration: '60 seconds',
        onTimeout: () => 'R did not respond within 60 seconds. A decision may still have been recorded. Check the R console, then refresh before deciding again.',
      }),
      // The whole busy region, including the first render, sits inside the exit
      // guard, so busy resets on success, failure, timeout, and defects alike.
      Effect.onExit(() => Effect.sync(() => { busy = false; })),
    );
    show(notice, decision);
  });
  context.subscriptions.push(vscode.commands.registerCommand('gladePrototype.open', () => run(Effect.gen(function* () {
    if (!api) {
      yield* Effect.tryPromise(() => Promise.resolve(vscode.window.showInformationMessage('This prototype requires Positron for access to R.')));
      return;
    }
    if (busy) return yield* Effect.fail('Wait for the current request before changing sessions.');
    const session = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.getForegroundSession()));
    if (!session || session.runtimeMetadata.languageId !== 'r') {
      yield* Effect.tryPromise(() => Promise.resolve(vscode.window.showInformationMessage('Start or select an R console, then open Glade again.')));
      return;
    }
    const name = yield* Effect.tryPromise(() => Promise.resolve(vscode.window.showInputBox({
      title: 'Attach to an existing Bayesgrove handle', value: handleName,
      prompt: 'Name of the R object in this console. Glade will not open a second project session.',
    })));
    if (name === undefined) return;
    if (busy) return yield* Effect.fail('Wait for the current request before changing sessions.');
    handleName = yield* Schema.decodeUnknown(HandleName)(name).pipe(
      Effect.mapError(() => 'Enter a valid R variable name: letters, numbers, dots, and underscores, starting with a letter or dot.'),
    );
    sessionId = session.metadata.sessionId;
    snapshot = undefined;
    if (!panel) {
      shellSent = false;
      lastNotice = '';
      lastDecision = undefined;
      panel = vscode.window.createWebviewPanel('gladePrototype', 'Glade review', vscode.ViewColumn.One, {
        enableScripts: true, localResourceRoots: [],
      });
      panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
      panel.webview.onDidReceiveMessage((raw) => {
        if (Schema.is(ReadyMessage)(raw)) { pushState(); return; }
        void run(Schema.decodeUnknown(Request)(raw).pipe(Effect.flatMap(request)));
      }, undefined, context.subscriptions);
    }
    panel.reveal();
    yield* request({ kind: 'snapshot' });
  }))));
  context.subscriptions.push(vscode.commands.registerCommand('gladePrototype.demo', () => run(Effect.gen(function* () {
    if (!api) return yield* Effect.fail('The scratch project requires Positron.');
    const session = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.getForegroundSession()));
    if (!session || session.runtimeMetadata.languageId !== 'r') return yield* Effect.fail('Start an R console first.');
    const code = yield* Effect.tryPromise(() => readFile(context.asAbsolutePath('r/scratch.R'), 'utf8'));
    yield* Effect.tryPromise(() => Promise.resolve(api.runtime.evaluateCode('r', code, undefined, session.metadata.sessionId, api.RuntimeBusyBehavior.Reject)));
    yield* Effect.tryPromise(() => Promise.resolve(vscode.commands.executeCommand('gladePrototype.open')));
  }))));
}
