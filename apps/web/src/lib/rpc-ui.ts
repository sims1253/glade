import type {
  WorkflowAddNodeInput,
  WorkflowRenameNodeInput,
  WorkflowSetNodeFileInput,
  WebSocketRequest
} from '@glade/contracts';

import { assertUnreachable } from './utils';

type RpcMethod = WebSocketRequest['method'];

/**
 * Generates a human-readable description for an RPC call for use in toast notifications.
 */
export function describeRpcCall(method: RpcMethod, body: WebSocketRequest['body']): string {
  switch (method) {
    case 'desktop.getEnvironment':
      return 'Loaded desktop environment';
    case 'desktop.refreshEnvironment':
      return 'Refreshed desktop environment';
    case 'desktop.saveSettings':
      return 'Saved desktop settings';
    case 'desktop.resetSettings':
      return 'Reset desktop settings';
    case 'desktop.bootstrapProject':
      return 'Bootstrapped project';
    case 'workflow.addNode': {
      const request = body as WorkflowAddNodeInput;
      return `Added ${request.label?.trim() || request.kind}`;
    }
    case 'workflow.deleteNode':
      return 'Deleted node';
    case 'workflow.connectNodes':
      return 'Connected nodes';
    case 'workflow.renameNode':
      return `Renamed node to ${(body as WorkflowRenameNodeInput).label}`;
    case 'workflow.recordDecision':
      return 'Recorded workflow decision';
    case 'workflow.executeAction':
      return 'Executed workflow action';
    case 'workflow.useDefaultWorkflow':
      return 'Activated the default workflow';
    case 'workflow.useWorkflowPacks':
      return 'Activated workflow packs';
    case 'workflow.updateNodeNotes':
      return 'Saved node notes';
    case 'workflow.updateNodeParameters':
      return 'Saved node parameters';
    case 'workflow.setNodeFile':
      return (body as WorkflowSetNodeFileInput).path ? 'Linked node file' : 'Removed node file link';
    case 'session.restart':
      return 'Restarted session';
    case 'repl.write':
      return 'Sent REPL input';
    case 'repl.clear':
      return 'Cleared REPL terminal';
    case 'host.openInEditor':
      return 'Opened linked file in editor';
    default:
      return assertUnreachable(method);
  }
}

/**
 * Returns true if success toasts should be suppressed for the given RPC method.
 * Used to avoid showing toasts for high-frequency operations like REPL input.
 */
export function shouldSuppressSuccessToast(method: RpcMethod): boolean {
  return method === 'repl.write' || method === 'repl.clear';
}

/**
 * Generates a human-readable error title for an RPC call failure.
 */
export function failureTitle(method: RpcMethod): string {
  switch (method) {
    case 'desktop.getEnvironment':
      return 'Could not load desktop environment';
    case 'desktop.refreshEnvironment':
      return 'Could not refresh desktop environment';
    case 'desktop.saveSettings':
      return 'Could not save desktop settings';
    case 'desktop.resetSettings':
      return 'Could not reset desktop settings';
    case 'desktop.bootstrapProject':
      return 'Could not bootstrap project';
    case 'workflow.addNode':
      return 'Could not add node';
    case 'workflow.deleteNode':
      return 'Could not delete node';
    case 'workflow.connectNodes':
      return 'Could not connect nodes';
    case 'workflow.renameNode':
      return 'Could not rename node';
    case 'workflow.recordDecision':
      return 'Could not record workflow decision';
    case 'workflow.executeAction':
      return 'Could not execute workflow action';
    case 'workflow.useDefaultWorkflow':
      return 'Could not activate the default workflow';
    case 'workflow.useWorkflowPacks':
      return 'Could not activate workflow packs';
    case 'workflow.updateNodeNotes':
      return 'Could not save node notes';
    case 'workflow.updateNodeParameters':
      return 'Could not save node parameters';
    case 'workflow.setNodeFile':
      return 'Could not update linked file';
    case 'session.restart':
      return 'Could not restart session';
    case 'repl.write':
      return 'Could not send REPL input';
    case 'repl.clear':
      return 'Could not clear REPL terminal';
    case 'host.openInEditor':
      return 'Could not open file in editor';
    default:
      return assertUnreachable(method);
  }
}
