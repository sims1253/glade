import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { NodeShell } from '../node-shell';

export const DataSourceNode = memo(function DataSourceNode(props: NodeProps<WorkflowFlowNode>) {
  return <NodeShell {...props} accentClassName="from-sky-500/18 via-sky-400/8 to-transparent" kindLabel="Data Source" />;
});
