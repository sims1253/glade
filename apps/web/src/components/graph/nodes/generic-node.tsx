import { memo, useMemo, useState, type ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';

import type { NodeComponentProps } from '@glade/contracts';

import { useGraphStore } from '../../../store/graph';
import { useNodeExtensionComponent } from '../../../lib/extension-loader';
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
  const { dispatchCommand } = useWorkflowCanvasContext();
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
      submitLabel={pending ? 'Saving…' : 'Save parameters'}
      pending={pending}
      compact
      onSubmit={async (params) => {
        setPending(true);
        try {
          await dispatchCommand({
            type: 'UpdateNodeParameters',
            nodeId: data.id,
            params,
          });
        } finally {
          setPending(false);
        }
      }}
    />
  );
}

function GenericNodeExtension({
  component: Component,
  data,
}: {
  readonly component: ComponentType<NodeComponentProps>;
  readonly data: WorkflowFlowNode['data'];
}) {
  return (
    <div className="space-y-3">
      <Component
        nodeId={data.id}
        label={data.label}
        status={data.status}
        parameters={data.parameters ?? {}}
        metadata={data.metadata ?? {}}
      />
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
        Trusted local extension UI
      </p>
    </div>
  );
}

export const GenericNode = memo(function GenericNode(props: NodeProps<WorkflowFlowNode>) {
  const { data } = props;
  const CustomComponent = useNodeExtensionComponent(data.kind, data.browserBundlePath ?? null);
  const schema = asObject(data.parameterSchema);

  return (
    <NodeShell {...props} accentClassName="from-slate-500/18 via-slate-300/8 to-transparent">
      {CustomComponent ? <GenericNodeExtension component={CustomComponent} data={data} /> : null}
      {!CustomComponent && schema ? <GenericNodeAutoForm data={data} /> : null}
      {!CustomComponent && !schema ? (
        <p className="text-xs text-slate-400">
          Extension nodes without a GUI bundle fall back to the shared Glade shell.
        </p>
      ) : null}
    </NodeShell>
  );
});
