import { describe, expect, it } from 'vitest';

import { createWorkflowCommandEnvelope } from './workflow-commands';

describe('createWorkflowCommandEnvelope', () => {
  it('wraps phase 4 graph commands without mutating their shape', () => {
    expect(createWorkflowCommandEnvelope({ type: 'AddNode', kind: 'source', label: 'Source' }, 'cmd.add')).toEqual({
      id: 'cmd.add',
      command: { type: 'AddNode', kind: 'source', label: 'Source' },
    });

    expect(createWorkflowCommandEnvelope({ type: 'DeleteNode', nodeId: 'node_1' }, 'cmd.delete')).toEqual({
      id: 'cmd.delete',
      command: { type: 'DeleteNode', nodeId: 'node_1' },
    });

    expect(createWorkflowCommandEnvelope({ type: 'ConnectNodes', from: 'node_1', to: 'node_2' }, 'cmd.connect')).toEqual({
      id: 'cmd.connect',
      command: { type: 'ConnectNodes', from: 'node_1', to: 'node_2' },
    });

    expect(createWorkflowCommandEnvelope({ type: 'RenameNode', nodeId: 'node_1', label: 'Renamed' }, 'cmd.rename')).toEqual({
      id: 'cmd.rename',
      command: { type: 'RenameNode', nodeId: 'node_1', label: 'Renamed' },
    });
  });
});
