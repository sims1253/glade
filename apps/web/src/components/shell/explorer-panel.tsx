import { useCallback, useMemo, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  FileCode2,
  FlaskConical,
  GitCompare,
  Plus,
  Stethoscope,
} from 'lucide-react';

import type { WorkflowGraph, WorkflowNodeData } from '../../lib/graph-types';
import { cn } from '../../lib/utils';
import { useGraphStore } from '../../store/graph';
import { useWorkspaceStore, type ExplorerGroup } from '../../store/workspace';

type ExplorerGroupId = 'data-sources' | 'model-specs' | 'fits' | 'diagnostics' | 'results';

function resolveGroupId(node: WorkflowNodeData): ExplorerGroupId {
  switch (node.rendererKind) {
    case 'data_source':
      return 'data-sources';
    case 'model_spec':
      return 'model-specs';
    case 'fit':
      return 'fits';
    case 'diagnostic':
      return 'diagnostics';
    default:
      return 'results';
  }
}

function groupNodesByKind(nodes: ReadonlyArray<WorkflowNodeData>) {
  const groups: Record<ExplorerGroupId, Array<WorkflowNodeData>> = {
    'data-sources': [],
    'model-specs': [],
    fits: [],
    diagnostics: [],
    results: [],
  };

  for (const node of nodes) {
    groups[resolveGroupId(node)].push(node);
  }

  return groups;
}

function getNodeIcon(node: WorkflowNodeData) {
  switch (node.rendererKind) {
    case 'data_source':
      return <Database className="size-4" />;
    case 'model_spec':
      return <FileCode2 className="size-4" />;
    case 'fit':
      return <FlaskConical className="size-4" />;
    case 'diagnostic':
      return <Stethoscope className="size-4" />;
    default:
      return <GitCompare className="size-4" />;
  }
}

function getStatusIndicator(node: WorkflowNodeData) {
  switch (node.status) {
    case 'ok':
      return <span className="size-2 rounded-full bg-emerald-500" />;
    case 'warning':
    case 'blocked':
      return <span className="size-2 rounded-full bg-amber-500" />;
    case 'error':
      return <span className="size-2 rounded-full bg-rose-500" />;
    default:
      return <span className="size-2 rounded-full bg-slate-300" />;
  }
}

function isClosableNode(node: WorkflowNodeData) {
  return node.rendererKind !== 'data_source';
}

function createNodeTab(node: WorkflowNodeData) {
  return {
    id: `node-${node.id}`,
    type: node.rendererKind === 'diagnostic' ? 'diagnostics' : 'editor',
    nodeId: node.id,
    label: node.label,
    icon: node.rendererKind === 'diagnostic' ? 'Dx' : 'Node',
    closable: isClosableNode(node),
  } as const;
}

interface ExplorerGroupHeaderProps {
  group: ExplorerGroup;
  count: number;
  onAddNode?: (() => void) | undefined;
  onToggle: () => void;
}

function ExplorerGroupHeader({ group, count, onAddNode, onToggle }: ExplorerGroupHeaderProps) {
  return (
    <div className="group px-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        {group.expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="flex-1 text-left">{group.title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{count}</span>
      </button>
      {onAddNode ? (
        <button
          type="button"
          onClick={onAddNode}
          className="absolute right-4 top-2.5 hidden rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 group-hover:block"
          aria-label={`Add ${group.title}`}
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ExplorerNodeItem({
  node,
  isSelected,
  isHighlighted,
  onClick,
}: {
  node: WorkflowNodeData;
  isSelected: boolean;
  isHighlighted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        isSelected && 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
        isHighlighted && !isSelected && 'bg-sky-50 text-sky-900',
        !isSelected && !isHighlighted && 'text-slate-700 hover:bg-slate-100',
      )}
    >
      <span className="text-slate-500">{getNodeIcon(node)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{node.label}</span>
        <span className="block truncate text-xs text-slate-500">{node.kind.replaceAll('_', ' ')}</span>
      </span>
      {getStatusIndicator(node)}
    </button>
  );
}

interface ExplorerPanelProps {
  graph: WorkflowGraph | null;
  onAddNode?: (groupId: string) => void;
  actionsSlot?: ReactNode;
}

export function ExplorerPanel({ graph, onAddNode, actionsSlot }: ExplorerPanelProps) {
  const groups = useWorkspaceStore((state) => state.explorerGroups);
  const toggleGroup = useWorkspaceStore((state) => state.toggleExplorerGroup);
  const addTab = useWorkspaceStore((state) => state.addTab);
  const setSelectedNode = useWorkspaceStore((state) => state.setSelectedNode);
  const setHighlightedNodes = useWorkspaceStore((state) => state.setHighlightedNodes);

  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const setHighlightedNodeIds = useGraphStore((state) => state.setHighlightedNodeIds);

  const nodesByGroup = useMemo(() => groupNodesByKind(graph?.nodes ?? []), [graph?.nodes]);

  const handleNodeClick = useCallback((node: WorkflowNodeData) => {
    setSelectedNodeId(node.id);
    setSelectedNode(node.id);
    setHighlightedNodeIds([]);
    setHighlightedNodes([]);
    addTab(createNodeTab(node));
  }, [addTab, setHighlightedNodeIds, setHighlightedNodes, setSelectedNode, setSelectedNodeId]);

  return (
    <aside className="flex h-full flex-col bg-white">
      <header className="border-b border-slate-200 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
        <h1 className="mt-2 truncate text-base font-semibold text-slate-900">{graph?.projectName ?? 'Glade project'}</h1>
        <p className="mt-1 text-xs text-slate-500">Explorer stays in sync with the active workflow selection.</p>
        {actionsSlot ? <div className="mt-4">{actionsSlot}</div> : null}
      </header>

      <nav className="relative flex-1 overflow-y-auto py-3">
        {groups.map((group) => {
          const nodes = nodesByGroup[group.id as ExplorerGroupId] ?? [];
          return (
            <section key={group.id} className="relative mb-2">
              <ExplorerGroupHeader
                group={group}
                count={nodes.length}
                onAddNode={onAddNode ? () => onAddNode(group.id) : undefined}
                onToggle={() => toggleGroup(group.id)}
              />
              {group.expanded ? (
                nodes.length > 0 ? (
                  <ul className="space-y-1 px-2 pb-2">
                    {nodes.map((node) => (
                      <li key={node.id}>
                        <ExplorerNodeItem
                          node={node}
                          isSelected={selectedNodeId === node.id}
                          isHighlighted={highlightedNodeIds.includes(node.id)}
                          onClick={() => handleNodeClick(node)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-2 text-xs text-slate-400">No nodes in this section yet.</p>
                )
              ) : null}
            </section>
          );
        })}
      </nav>
    </aside>
  );
}
