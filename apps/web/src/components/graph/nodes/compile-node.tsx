import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const CompileNode = memo(function CompileNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-indigo-500/18 via-indigo-400/10 to-transparent" kindLabel="Compile" />;
});
