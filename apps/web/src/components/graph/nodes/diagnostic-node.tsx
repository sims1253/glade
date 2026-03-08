import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const DiagnosticNode = memo(function DiagnosticNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-amber-500/18 via-amber-300/10 to-transparent" kindLabel="Diagnostic" />;
});
