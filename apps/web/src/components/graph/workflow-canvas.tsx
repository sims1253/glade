import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  useReactFlow,
} from '@xyflow/react';

import type { WorkflowFlowNode, WorkflowGraph, WorkflowNodeData } from '../../lib/graph-types';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/app';
import { useGraphStore } from '../../store/graph';
import { layoutWorkflowGraph, toReactFlowEdges, toReactFlowNodes } from '../../lib/graph-layout';
import { CanvasStatusBanner } from './canvas-status-banner';
import { workflowNodeTypes } from './node-registry';

function sameNode(left: WorkflowFlowNode, right: WorkflowFlowNode) {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.data.label === right.data.label &&
    left.data.kind === right.data.kind &&
    left.data.status === right.data.status &&
    left.data.obligationCount === right.data.obligationCount
  );
}

function sameEdge(left: Edge, right: Edge) {
  return (
    left.id === right.id &&
    left.source === right.source &&
    left.target === right.target &&
    left.label === right.label
  );
}

function reconcileNodes(
  previous: Array<WorkflowFlowNode>,
  next: Array<WorkflowFlowNode>,
) {
  const previousMap = new Map(previous.map((node) => [node.id, node]));
  return next.map((node) => {
    const existing = previousMap.get(node.id);
    return existing && sameNode(existing, node) ? existing : node;
  });
}

function reconcileEdges(previous: Array<Edge>, next: Array<Edge>) {
  const previousMap = new Map(previous.map((edge) => [edge.id, edge]));
  return next.map((edge) => {
    const existing = previousMap.get(edge.id);
    return existing && sameEdge(existing, edge) ? existing : edge;
  });
}

function CanvasKeyboardShortcuts() {
  const reactFlow = useReactFlow<WorkflowFlowNode>();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }

      const isZoomShortcut = event.metaKey || event.ctrlKey;
      if (isZoomShortcut && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        void reactFlow.zoomIn({ duration: 150 });
        return;
      }
      if (isZoomShortcut && event.key === '-') {
        event.preventDefault();
        void reactFlow.zoomOut({ duration: 150 });
        return;
      }
      if (isZoomShortcut && event.key === '0') {
        event.preventDefault();
        void reactFlow.fitView({ duration: 180, padding: 0.16 });
        return;
      }

      const viewport = reactFlow.getViewport();
      const delta = 72;
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          void reactFlow.setViewport({ ...viewport, y: viewport.y + delta }, { duration: 120 });
          break;
        case 'ArrowDown':
          event.preventDefault();
          void reactFlow.setViewport({ ...viewport, y: viewport.y - delta }, { duration: 120 });
          break;
        case 'ArrowLeft':
          event.preventDefault();
          void reactFlow.setViewport({ ...viewport, x: viewport.x + delta }, { duration: 120 });
          break;
        case 'ArrowRight':
          event.preventDefault();
          void reactFlow.setViewport({ ...viewport, x: viewport.x - delta }, { duration: 120 });
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reactFlow]);

  return null;
}

interface WorkflowCanvasProps {
  readonly className?: string;
}

export function WorkflowCanvas({ className }: WorkflowCanvasProps) {
  const graph = useGraphStore((state) => state.graph);
  const sessionState = useAppStore((state) => state.sessionState);
  const sessionReason = useAppStore((state) => state.sessionReason);
  const topologySignatureRef = useRef<string | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [nodes, setNodes] = useState<Array<WorkflowFlowNode>>([]);
  const [edges, setEdges] = useState<Array<Edge>>([]);

  useEffect(() => {
    let cancelled = false;

    async function syncGraph(nextGraph: WorkflowGraph | null) {
      if (!nextGraph) {
        setNodes([]);
        setEdges([]);
        topologySignatureRef.current = null;
        positionsRef.current = {};
        return;
      }

      if (topologySignatureRef.current !== nextGraph.topologySignature) {
        positionsRef.current = await layoutWorkflowGraph(nextGraph);
        topologySignatureRef.current = nextGraph.topologySignature;
      }

      if (cancelled) {
        return;
      }

      const nextNodes = toReactFlowNodes(nextGraph.nodes, positionsRef.current);
      const nextEdges = toReactFlowEdges(nextGraph.edges);
      setNodes((previous) => reconcileNodes(previous, nextNodes));
      setEdges((previous) => reconcileEdges(previous, nextEdges));
    }

    void syncGraph(graph);
    return () => {
      cancelled = true;
    };
  }, [graph]);

  const helpText = useMemo(
    () => (graph ? `${graph.nodes.length} nodes · ${graph.edges.length} edges` : 'Waiting for graph snapshot…'),
    [graph],
  );

  return (
    <div className={cn('relative h-full min-h-[38rem] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 shadow-2xl shadow-slate-950/30', className)}>
      <CanvasStatusBanner sessionState={sessionState} sessionReason={sessionReason} />
      {graph ? null : (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-5 py-4 text-sm text-slate-300 shadow-xl">
            Waiting for the first graph snapshot from bayesgrove…
          </div>
        </div>
      )}
      <div className="absolute left-4 top-4 z-10 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-1 text-xs text-slate-300 backdrop-blur">
        {helpText}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.25}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        zoomOnDoubleClick={false}
        elevateEdgesOnSelect={false}
        proOptions={{ hideAttribution: true }}
        className="workflow-flow"
      >
        <CanvasKeyboardShortcuts />
        <MiniMap
          pannable
          zoomable
          className="!bottom-4 !right-4 !border !border-slate-800 !bg-slate-950/90"
          nodeColor={(node) => {
            const status = (node.data as WorkflowNodeData).status;
            switch (status) {
              case 'warning':
                return '#f59e0b';
              case 'error':
                return '#fb7185';
              case 'pending':
                return '#38bdf8';
              case 'held':
                return '#a78bfa';
              case 'blocked':
                return '#fb923c';
              case 'stale':
                return '#94a3b8';
              default:
                return '#34d399';
            }
          }}
        />
        <Controls className="!bottom-4 !left-4 !border !border-slate-800 !bg-slate-950/90" showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} color="rgba(148, 163, 184, 0.18)" />
      </ReactFlow>
    </div>
  );
}
