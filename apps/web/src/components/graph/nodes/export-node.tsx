import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const ExportNode = memo(function ExportNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-fuchsia-500/18 via-fuchsia-400/10 to-transparent" kindLabel="Export" />;
});
