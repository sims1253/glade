import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type ReactFlowInstance,
  useReactFlow,
} from '@xyflow/react';

import { canConnectNodes, getConnectionPreview, getDownstreamNodeIds } from '../../lib/graph-interactions';
import { layoutWorkflowGraph, toReactFlowEdges, toReactFlowNodes } from '../../lib/graph-layout';
import { toJsonObject } from '../../lib/json';
import type { HostRpc, WorkflowRpc } from '../../lib/rpc';
import { formatKindLabel, type WorkflowFlowNode, type WorkflowGraph, type WorkflowNodeData } from '../../lib/graph-types';
import { cn } from '../../lib/utils';
import { useConnectionStore } from '../../store/connection';
import { useGraphStore } from '../../store/graph';
import { useToastStore } from '../../store/toast';
import { Button } from '../ui/button';
import { CanvasStatusBanner } from './canvas-status-banner';
import { NodeDetailDrawer } from './node-detail-drawer';
import { workflowNodeTypes } from './node-registry';
import { SchemaDrivenForm } from '../extensions/schema-form';
import { WorkflowCanvasToolbar } from './workflow-canvas-toolbar';
import {
  WorkflowCanvasContextProvider,
  type ConnectionPreviewState,
} from './workflow-canvas-context';

function sameNode(left: WorkflowFlowNode, right: WorkflowFlowNode) {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.selected === right.selected &&
    left.data.label === right.data.label &&
    left.data.kind === right.data.kind &&
    left.data.status === right.data.status &&
    left.data.blockReason === right.data.blockReason &&
    left.data.obligationCount === right.data.obligationCount &&
    left.data.blockingObligationCount === right.data.blockingObligationCount &&
    left.data.isHighlighted === right.data.isHighlighted
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

function reconcileNodes(previous: Array<WorkflowFlowNode>, next: Array<WorkflowFlowNode>) {
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

function mergeStoredPositions(
  nodeIds: ReadonlyArray<string>,
  previous: Record<string, { x: number; y: number }>,
  next: Record<string, { x: number; y: number }>,
) {
  return Object.fromEntries(
    nodeIds.map((nodeId) => [nodeId, previous[nodeId] ?? next[nodeId] ?? { x: 0, y: 0 }]),
  ) as Record<string, { x: number; y: number }>;
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
  readonly workflow: WorkflowRpc;
  readonly host: HostRpc;
}

type ContextMenuState =
  | { readonly mode: 'pane'; readonly x: number; readonly y: number }
  | { readonly mode: 'node'; readonly x: number; readonly y: number; readonly nodeId: string; readonly label: string };

export function WorkflowCanvas({ className, workflow, host }: WorkflowCanvasProps) {
  const graph = useGraphStore((state) => state.graph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const setHighlightedNodeIds = useGraphStore((state) => state.setHighlightedNodeIds);
  const sessionState = useConnectionStore((state) => state.sessionState);
  const sessionReason = useConnectionStore((state) => state.sessionReason);
  const pushNotification = useToastStore((state) => state.pushNotification);
  const topologySignatureRef = useRef<string | null>(null);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const reactFlowRef = useRef<ReactFlowInstance<WorkflowFlowNode> | null>(null);
  const pendingNodesRef = useRef<Array<WorkflowFlowNode>>([]);
  const pendingEdgesRef = useRef<Array<Edge>>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [pendingNodeKind, setPendingNodeKind] = useState('');
  const [pendingNodeLabel, setPendingNodeLabel] = useState('');
  const [addNodePending, setAddNodePending] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [connectionPreview, setConnectionPreview] = useState<ConnectionPreviewState | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamePending, setRenamePending] = useState(false);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph, selectedNodeId],
  );
  const selectedPendingNodeKind = useMemo(
    () => graph?.nodeKinds.find((kind) => kind.kind === pendingNodeKind) ?? null,
    [graph, pendingNodeKind],
  );

  const downstreamNodes = useMemo(() => {
    if (!graph || !selectedNodeId) {
      return [];
    }

    return getDownstreamNodeIds(graph, selectedNodeId)
      .map((nodeId) => graph.nodes.find((node) => node.id === nodeId) ?? null)
      .filter((node): node is WorkflowNodeData => node !== null);
  }, [graph, selectedNodeId]);

  useEffect(() => {
    if (!graph?.nodeKinds.length) {
      setPendingNodeKind('');
      return;
    }

    if (!graph.nodeKinds.some((kind) => kind.kind === pendingNodeKind)) {
      setPendingNodeKind(graph.nodeKinds[0]?.kind ?? '');
    }
  }, [graph, pendingNodeKind]);

  useEffect(() => {
    let cancelled = false;

    async function syncGraph(nextGraph: WorkflowGraph | null) {
      if (!nextGraph) {
        pendingNodesRef.current = [];
        pendingEdgesRef.current = [];
        reactFlowRef.current?.setNodes([]);
        reactFlowRef.current?.setEdges([]);
        topologySignatureRef.current = null;
        positionsRef.current = {};
        return;
      }

      if (topologySignatureRef.current !== nextGraph.topologySignature) {
        const nextPositions = await layoutWorkflowGraph(nextGraph);
        positionsRef.current = topologySignatureRef.current === null
          ? nextPositions
          : mergeStoredPositions(
              nextGraph.nodes.map((node) => node.id),
              positionsRef.current,
              nextPositions,
            );
        topologySignatureRef.current = nextGraph.topologySignature;
      }

      if (cancelled) {
        return;
      }

      const highlightedNodeIdSet = new Set(highlightedNodeIds);
      const nextNodes = toReactFlowNodes(nextGraph.nodes, positionsRef.current).map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          ...node.data,
          isHighlighted: highlightedNodeIdSet.has(node.id),
        },
      }));
      const nextEdges = toReactFlowEdges(nextGraph.edges);
      pendingNodesRef.current = nextNodes;
      pendingEdgesRef.current = nextEdges;

      const reactFlow = reactFlowRef.current;
      if (!reactFlow) {
        return;
      }

      reactFlow.setNodes((previous) => reconcileNodes(previous, nextNodes));
      reactFlow.setEdges((previous) => reconcileEdges(previous, nextEdges));
    }

    void syncGraph(graph);
    return () => {
      cancelled = true;
    };
  }, [graph, highlightedNodeIds, selectedNodeId]);

  useEffect(() => {
    if (contextMenu?.mode === 'node' && !graph?.nodes.some((node) => node.id === contextMenu.nodeId)) {
      setContextMenu(null);
    }
  }, [contextMenu, graph]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId && !isDeleteDialogOpen) {
        event.preventDefault();
        setIsDeleteDialogOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDeleteDialogOpen, selectedNodeId]);

  const beginRename = useCallback((nodeId: string, label: string) => {
    setSelectedNodeId(nodeId);
    setRenamingNodeId(nodeId);
    setRenameDraft(label);
    setContextMenu(null);
  }, [setSelectedNodeId]);

  const cancelRename = useCallback(() => {
    setRenamingNodeId(null);
    setRenameDraft('');
    setRenamePending(false);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingNodeId) {
      return;
    }

    const label = renameDraft.trim();
    if (!label) {
      pushNotification({
        tone: 'error',
        title: 'Rename requires a label',
        description: 'Enter a node label before submitting the rename.',
      });
      return;
    }

    setRenamePending(true);
    const result = await workflow.renameNode({
      nodeId: renamingNodeId,
      label,
    });
    setRenamePending(false);

    if (result.success) {
      cancelRename();
    }
  }, [cancelRename, pushNotification, renameDraft, renamingNodeId, workflow]);

  const toolbarSummary = useMemo(() => {
    if (!graph) {
      return 'Waiting for graph snapshot…';
    }
    return `${graph.nodes.length} nodes · ${graph.edges.length} edges · ${graph.nodeKinds.length} kinds`;
  }, [graph]);

  const contextValue = useMemo(() => ({
    renamingNodeId,
    renameDraft,
    renamePending,
    connectionPreview,
    beginRename,
    cancelRename,
    commitRename,
    setRenameDraft,
    workflow,
  }), [beginRename, cancelRename, commitRename, connectionPreview, renameDraft, renamePending, renamingNodeId, workflow]);

  const closeMenus = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openAddDialog = useCallback(() => {
    if (!graph?.nodeKinds.length) {
      pushNotification({
        tone: 'error',
        title: 'No node kinds available',
        description: 'The current bayesgrove session did not expose any node kinds yet.',
      });
      return;
    }

    setPendingNodeKind((current) => current || graph.nodeKinds[0]?.kind || '');
    setPendingNodeLabel('');
    setAddNodePending(false);
    setIsAddDialogOpen(true);
    closeMenus();
  }, [closeMenus, graph, pushNotification]);

  const submitAddNode = useCallback(async (params?: Record<string, unknown>) => {
    if (!pendingNodeKind) {
      return null;
    }

    setAddNodePending(true);
    try {
      const result = await workflow.addNode({
        kind: pendingNodeKind,
        label: pendingNodeLabel.trim() || undefined,
        params: toJsonObject(params),
      });

      if (result.success) {
        setIsAddDialogOpen(false);
        setPendingNodeLabel('');
      }

      return result;
    } finally {
      setAddNodePending(false);
    }
  }, [pendingNodeKind, pendingNodeLabel, workflow]);

  const submitDeleteNode = useCallback(async () => {
    if (!selectedNodeId) {
      return;
    }

    const result = await workflow.deleteNode({
      nodeId: selectedNodeId,
    });

    if (result.success) {
      setIsDeleteDialogOpen(false);
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, setSelectedNodeId, workflow]);

  const onConnect = useCallback(async (connection: Connection) => {
    if (!graph || !connection.source || !connection.target) {
      return;
    }

    setConnectionPreview(null);
    if (!canConnectNodes(graph, connection.source, connection.target)) {
      pushNotification({
        tone: 'error',
        title: 'Connection not allowed',
        description: 'The target node does not accept the source output type.',
      });
      return;
    }

    await workflow.connectNodes({
      from: connection.source,
      to: connection.target,
    });
  }, [graph, pushNotification, workflow]);

  const autoArrange = useCallback(async () => {
    if (!graph) {
      return;
    }

    positionsRef.current = await layoutWorkflowGraph(graph);
    const highlightedNodeIdSet = new Set(highlightedNodeIds);
    const nextNodes = toReactFlowNodes(graph.nodes, positionsRef.current).map((node) => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        isHighlighted: highlightedNodeIdSet.has(node.id),
      },
    }));
    pendingNodesRef.current = nextNodes;
    reactFlowRef.current?.setNodes((previous) => reconcileNodes(previous, nextNodes));
  }, [graph, highlightedNodeIds, selectedNodeId]);

  return (
    <WorkflowCanvasContextProvider value={contextValue}>
      <div className={cn('relative h-full min-h-[38rem] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 shadow-2xl shadow-slate-950/30', className)}>
        <CanvasStatusBanner sessionState={sessionState} sessionReason={sessionReason} />
        {graph ? null : (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/90 px-5 py-4 text-sm text-slate-300 shadow-xl">
              Waiting for the first graph snapshot from bayesgrove…
            </div>
          </div>
        )}
        <WorkflowCanvasToolbar
          summary={toolbarSummary}
          onAddNode={openAddDialog}
          onAutoArrange={() => {
            void autoArrange();
          }}
        />
        <ReactFlow
          defaultNodes={pendingNodesRef.current}
          defaultEdges={pendingEdgesRef.current}
          nodeTypes={workflowNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.25}
          maxZoom={1.6}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          deleteKeyCode={null}
          panOnDrag
          panOnScroll
          zoomOnDoubleClick={false}
          elevateEdgesOnSelect={false}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            instance.setNodes((previous) => reconcileNodes(previous, pendingNodesRef.current));
            instance.setEdges((previous) => reconcileEdges(previous, pendingEdgesRef.current));
          }}
          isValidConnection={(connection) =>
            !!graph && !!connection.source && !!connection.target && canConnectNodes(graph, connection.source, connection.target)
          }
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setContextMenu(null);
          }}
          onNodeDragStop={(_, node) => {
            positionsRef.current = {
              ...positionsRef.current,
              [node.id]: {
                x: node.position.x,
                y: node.position.y,
              },
            };
          }}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setSelectedNodeId(node.id);
            setContextMenu({
              mode: 'node',
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
              label: (node.data as WorkflowNodeData).label,
            });
          }}
          onPaneClick={() => {
            setSelectedNodeId(null);
            setHighlightedNodeIds([]);
            closeMenus();
          }}
          onPaneContextMenu={(event) => {
            event.preventDefault();
            setSelectedNodeId(null);
            setHighlightedNodeIds([]);
            setContextMenu({ mode: 'pane', x: event.clientX, y: event.clientY });
          }}
          onConnectStart={(_, params) => {
            if (!graph || !params.nodeId) {
              return;
            }

            const preview = getConnectionPreview(graph, params.nodeId);
            setConnectionPreview({
              sourceNodeId: params.nodeId,
              validTargetIds: preview.validTargetIds,
              invalidTargetIds: preview.invalidTargetIds,
            });
          }}
          onConnectEnd={() => setConnectionPreview(null)}
          onConnect={onConnect}
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

        {contextMenu ? (
          <div
            className="fixed z-40 min-w-48 rounded-2xl border border-slate-700 bg-slate-950/95 p-2 shadow-2xl backdrop-blur"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.mode === 'pane' ? (
              <button className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800" onClick={openAddDialog}>
                Add node
              </button>
            ) : (
              <>
                <button className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800" onClick={() => beginRename(contextMenu.nodeId, contextMenu.label)}>
                  Rename {contextMenu.label}
                </button>
                <button className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-950/60" onClick={() => {
                  setIsDeleteDialogOpen(true);
                  closeMenus();
                }}>
                  Delete {contextMenu.label}
                </button>
              </>
            )}
          </div>
        ) : null}

        {isAddDialogOpen ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-50">Add node</h2>
              <p className="mt-2 text-sm text-slate-400">Pick a node kind exposed by the live bayesgrove session and optionally give it a label.</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="max-h-72 space-y-2 overflow-auto rounded-2xl border border-slate-800 p-2">
                  {graph?.nodeKinds.map((kind) => (
                    <button
                      key={kind.kind}
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                        pendingNodeKind === kind.kind
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-900/70 hover:bg-slate-900',
                      )}
                      onClick={() => setPendingNodeKind(kind.kind)}
                    >
                      <div className="text-sm font-semibold text-slate-100">{kind.label}</div>
                      <div className="mt-1 text-xs text-slate-400">{kind.description}</div>
                    </button>
                  ))}
                </div>
                <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div>
                    <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Selected kind</label>
                    <p className="mt-2 text-sm text-slate-100">{formatKindLabel(pendingNodeKind || 'node')}</p>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.18em] text-slate-400" htmlFor="phase4-node-label">Node label</label>
                    <input
                      id="phase4-node-label"
                      value={pendingNodeLabel}
                      onChange={(event) => setPendingNodeLabel(event.target.value)}
                      placeholder="Optional label"
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
                    />
                  </div>
                  {selectedPendingNodeKind?.parameterSchema ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Parameters</p>
                      <div className="mt-3">
                        <SchemaDrivenForm
                          schema={selectedPendingNodeKind.parameterSchema}
                          resetKey={selectedPendingNodeKind.kind}
                          nodeOptions={graph?.nodes.map((node) => ({ id: node.id, label: node.label })) ?? []}
                          submitLabel={addNodePending ? 'Adding node...' : 'Add node'}
                          pending={addNodePending}
                          onSubmit={async (params) => {
                            const result = await submitAddNode(params);
                            if (!result?.success) {
                              throw new Error(result?.error?.message ?? 'Could not add node.');
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                {!selectedPendingNodeKind?.parameterSchema ? (
                  <Button onClick={() => void submitAddNode()} disabled={!pendingNodeKind || addNodePending}>
                    {addNodePending ? 'Adding node...' : 'Add node'}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {isDeleteDialogOpen && selectedNode ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold text-slate-50">Delete {selectedNode.label}?</h2>
              <p className="mt-2 text-sm text-slate-400">
                Deleting {selectedNode.label} will affect {downstreamNodes.length} downstream node{downstreamNodes.length === 1 ? '' : 's'}.
              </p>
              {downstreamNodes.length > 0 ? (
                <ul className="mt-4 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                  {downstreamNodes.map((node) => (
                    <li key={node.id}>{node.label}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => void submitDeleteNode()}>Dispatch DeleteNode</Button>
              </div>
            </div>
          </div>
        ) : null}

        {graph && selectedNode ? (
          <NodeDetailDrawer
            graph={graph}
            node={selectedNode}
            workflow={workflow}
            host={host}
            onClose={() => setSelectedNodeId(null)}
            onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
          />
        ) : null}
      </div>
    </WorkflowCanvasContextProvider>
  );
}
