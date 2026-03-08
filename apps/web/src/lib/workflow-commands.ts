import type { Command, CommandEnvelope, HostCommand, WorkflowCommand } from '@glade/contracts';

function assertNever(value: never): never {
  throw new Error(`Unhandled command: ${JSON.stringify(value)}`);
}

export function createCommandEnvelope(command: Command, id?: string): CommandEnvelope {
  return {
    id: id ?? crypto.randomUUID(),
    command,
  };
}

export function createWorkflowCommandEnvelope(command: WorkflowCommand, id?: string): CommandEnvelope {
  return createCommandEnvelope(command, id);
}

export function createHostCommandEnvelope(command: HostCommand, id?: string): CommandEnvelope {
  return createCommandEnvelope(command, id);
}

export function describeCommand(command: Command) {
  switch (command.type) {
    case 'AddNode':
      return `Added ${command.label?.trim() || command.kind}`;
    case 'DeleteNode':
      return 'Deleted node';
    case 'ConnectNodes':
      return 'Connected nodes';
    case 'RenameNode':
      return `Renamed node to ${command.label}`;
    case 'RecordDecision':
      return 'Recorded workflow decision';
    case 'ExecuteAction':
      return 'Executed workflow action';
    case 'UpdateNodeNotes':
      return 'Saved node notes';
    case 'SetNodeFile':
      return command.path ? 'Linked node file' : 'Removed node file link';
    case 'RestartSession':
      return 'Restarted session';
    case 'ReplInput':
      return 'Sent REPL input';
    case 'ClearRepl':
      return 'Cleared REPL terminal';
    case 'OpenFileInEditor':
      return 'Opened linked file in editor';
    case 'SelectDirectory':
      return 'Selected directory';
    case 'GetSystemInfo':
      return 'Loaded system info';
    default:
      return assertNever(command);
  }
}

export function describeWorkflowCommand(command: WorkflowCommand) {
  return describeCommand(command);
}
