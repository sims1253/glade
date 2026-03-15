import { memo, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';

import { workflowRpcFromLegacyDispatch } from '../../../lib/legacy-commands';
import { toJsonObject } from '../../../lib/json';
import { asRecord } from '@glade/shared';
import { useGraphStore } from '../../../store/graph';
import type { WorkflowFlowNode } from '../../../lib/graph-types';
import { SchemaDrivenForm } from '../../extensions/schema-form';
import { NodeShell } from '../node-shell';
import { useWorkflowCanvasContext } from '../workflow-canvas-context';

function GenericNodeAutoForm({ data, schema }: { readonly data: WorkflowFlowNode['data']; readonly schema: ReturnType<typeof asRecord> | null }) {
  const context = useWorkflowCanvasContext();
  const workflow = context.workflow ?? (context.dispatchCommand ? workflowRpcFromLegacyDispatch(context.dispatchCommand) : null);
  const graph = useGraphStore((state) => state.graph);
  const [pending, setPending] = useState(false);
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

function useParameterSchema(parameterSchema: unknown) {
  return useMemo(() => asRecord(parameterSchema), [parameterSchema]);
}

export const GenericNode = memo(function GenericNode(props: NodeProps<WorkflowFlowNode>) {
  const { data } = props;
  const schema = useParameterSchema(data.parameterSchema);

  return (
    <NodeShell {...props} accentClassName="from-slate-500/18 via-slate-300/8 to-transparent">
      {schema ? <GenericNodeAutoForm data={data} schema={schema} /> : null}
      {!schema ? (
        <p className="text-xs text-slate-400">
          Bayesgrove did not expose editable parameters for this node kind.
        </p>
      ) : null}
    </NodeShell>
  );
});
