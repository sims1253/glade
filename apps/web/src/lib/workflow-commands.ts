import type { CommandEnvelope, WorkflowCommand } from '@glade/contracts';

export function createWorkflowCommandEnvelope(command: WorkflowCommand, id?: string): CommandEnvelope {
  return {
    id: id ?? crypto.randomUUID(),
    command,
  };
}

export function describeWorkflowCommand(command: WorkflowCommand) {
  switch (command.type) {
    case 'AddNode':
      return `Added ${command.label?.trim() || command.kind}`;
    case 'DeleteNode':
      return 'Deleted node';
    case 'ConnectNodes':
      return 'Connected nodes';
    case 'RenameNode':
      return `Renamed node to ${command.label}`;
    case 'ExecuteAction':
      return 'Executed workflow action';
    default:
      return command.type;
  }
}
