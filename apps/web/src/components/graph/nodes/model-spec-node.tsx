import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const ModelSpecNode = memo(function ModelSpecNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-cyan-500/18 via-cyan-400/10 to-transparent" kindLabel="Model Spec" />;
});
