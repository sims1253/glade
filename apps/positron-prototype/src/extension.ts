import * as vscode from 'vscode';
import { tryAcquirePositronApi } from '@posit-dev/positron';
import { Effect, Option, Schema } from 'effect';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { HandleName, Request, ReviewSnapshot } from './contracts';
import { render } from './view';

export function activate(context: vscode.ExtensionContext) {
  const api = tryAcquirePositronApi();
  let panel: vscode.WebviewPanel | undefined;
  let handleName = 'glade_prototype';
  let sessionId = '';
  let snapshot: ReviewSnapshot | undefined;
  let busy = false;
  const show = (notice = '') => {
    if (panel) panel.webview.html = render(snapshot, busy, notice, handleName, randomBytes(16).toString('hex'));
  };
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(
    Effect.catchAll((cause) => Effect.sync(() => {
      const failure = Schema.decodeUnknownOption(Schema.Struct({ cause: Schema.Struct({ message: Schema.String }) }))(cause);
      const message = Option.match(failure, { onNone: () => String(cause), onSome: (error) => error.cause.message });
      if (panel) show(message);
      else void vscode.window.showErrorMessage(message);
    })),
  ));
  const request = (message: Request) => Effect.gen(function* () {
    if (!api) return yield* Effect.fail('Open this prototype in Positron. VS Code session support is not implemented.');
    if (busy) return;
    busy = true;
    show();
    yield* Effect.gen(function* () {
      const session = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.getSession(sessionId)));
      if (!session || session.runtimeMetadata.languageId !== 'r') {
        snapshot = undefined;
        return yield* Effect.fail('The attached R session ended. Open the prototype again to attach to a session.');
      }
      const bridge = yield* Effect.tryPromise(() => readFile(context.asAbsolutePath('r/bridge.R'), 'utf8'));
      const code = `local({${bridge}\n if (!exists(${JSON.stringify(handleName)}, envir = .GlobalEnv, inherits = FALSE)) stop("The attached R object is missing. Reopen the project in R, then attach Glade again."); as.character(jsonlite::toJSON(glade_review_request(get(${JSON.stringify(handleName)}, envir = .GlobalEnv), jsonlite::fromJSON(${JSON.stringify(JSON.stringify(message))})), auto_unbox = TRUE, null = "null")) })`;
      const result = yield* Effect.tryPromise(() => Promise.resolve(api.runtime.evaluateCode(
        'r', code, undefined, sessionId, api.RuntimeBusyBehavior.Reject,
      )));
      const json = yield* Schema.decodeUnknown(Schema.String)(result.result);
      snapshot = yield* Schema.decodeUnknown(Schema.parseJson(ReviewSnapshot))(json);
    }).pipe(Effect.ensuring(Effect.sync(() => { busy = false; })));
    show(message.kind === 'decide' ? 'Decision recorded in Bayesgrove. The review list has been refreshed.' : 'Refreshed from the attached R session.');
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
    handleName = yield* Schema.decodeUnknown(HandleName)(name);
    sessionId = session.metadata.sessionId;
    snapshot = undefined;
    if (!panel) {
      panel = vscode.window.createWebviewPanel('gladePrototype', 'Glade review', vscode.ViewColumn.One, {
        enableScripts: true, localResourceRoots: [],
      });
      panel.onDidDispose(() => { panel = undefined; }, undefined, context.subscriptions);
      panel.webview.onDidReceiveMessage((raw) => { void run(Schema.decodeUnknown(Request)(raw).pipe(Effect.flatMap(request))); }, undefined, context.subscriptions);
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
