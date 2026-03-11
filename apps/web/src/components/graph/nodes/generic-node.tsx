import { memo, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';

import { workflowRpcFromLegacyDispatch } from '../../../lib/legacy-commands';
import { toJsonObject } from '../../../lib/json';
import { useGraphStore } from '../../../store/graph';
import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { SchemaDrivenForm } from '../../extensions/schema-form';
import { NodeShell } from '../node-shell';
import { useWorkflowCanvasContext } from '../workflow-canvas-context';

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function GenericNodeAutoForm({ data }: { readonly data: WorkflowFlowNode['data'] }) {
  const context = useWorkflowCanvasContext();
  const workflow = context.workflow ?? (context.dispatchCommand ? workflowRpcFromLegacyDispatch(context.dispatchCommand) : null);
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);
  const schema = useMemo(() => asObject(data.parameterSchema), [data.parameterSchema]);
  const nodeOptions = useMemo(
    () => graph?.nodes.map((node) => ({ id: node.id, label: node.label })) ?? [],
    [graph],
  );

  if (!schema) {
    return <p className="text-xs text-slate-400">No schema-driven controls were exposed for this node kind.</p>;
  }

  return (
    <SchemaDrivenForm
      schema={schema}
      initialValue={data.parameters ?? {}}
      resetKey={data.id}
      nodeOptions={nodeOptions}
      submitLabel={pending ? 'Saving parameters...' : 'Save parameters'}
      pending={pending}
      compact
      onSubmit={async (params) => {
        setPending(true);
        try {
          const nextParams = toJsonObject(params);
          if (!nextParams) {
            throw new Error('Could not serialize node parameters.');
          }

          const result = await workflow?.updateNodeParameters({
            nodeId: data.id,
            params: nextParams,
          });
          if (!result?.success) {
            throw new Error(result?.error?.message ?? 'Could not update node parameters.');
          }
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

export const GenericNode = memo(function GenericNode(props: NodeProps<WorkflowFlowNode>) {
  const { data } = props;
  const schema = asObject(data.parameterSchema);

  return (
    <NodeShell {...props} accentClassName="from-slate-500/18 via-slate-300/8 to-transparent">
      {schema ? <GenericNodeAutoForm data={data} /> : null}
      {!schema ? (
        <p className="text-xs text-slate-400">
          Bayesgrove did not expose editable parameters for this node kind.
        </p>
      ) : null}
    </NodeShell>
  );
});
