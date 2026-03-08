import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const FitNode = memo(function FitNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-emerald-500/18 via-emerald-400/10 to-transparent" kindLabel="Fit" />;
});
