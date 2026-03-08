import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const CompareNode = memo(function CompareNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-violet-500/18 via-violet-400/10 to-transparent" kindLabel="Compare" />;
});
