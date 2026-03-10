import type { ReactNode } from 'react';
import { Copy, GitCompare, Play, Trash2 } from 'lucide-react';

import { cn } from '../../lib/utils';
import type { WorkflowNodeData } from '../../lib/graph-types';
import { useWorkspaceStore } from '../../store/workspace';

interface FloatingNodeToolbarProps {
  node: WorkflowNodeData;
  position: { x: number; y: number };
  onRun?: (() => void) | undefined;
  onDuplicate?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  onCompare?: (() => void) | undefined;
  className?: string | undefined;
}

export function FloatingNodeToolbar({
  node,
  position,
  onRun,
  onDuplicate,
  onDelete,
  onCompare,
  className,
}: FloatingNodeToolbarProps) {
  const multiSelectedNodeIds = useWorkspaceStore((state) => state.multiSelectedNodeIds);
  const isMultiSelect = multiSelectedNodeIds.length > 1;
  const hasActions = isMultiSelect ? Boolean(onCompare) : Boolean(onRun || onDuplicate || onDelete);

  if (!hasActions) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute z-20 flex items-center gap-1 rounded-xl border border-slate-900/90 bg-slate-900 px-1 py-1 text-white shadow-[0_18px_36px_-18px_rgba(15,23,42,0.65)]',
        className,
      )}
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
    >
      {isMultiSelect ? (
        <>
          {onCompare && (
            <ToolbarButton
              icon={<GitCompare className="size-4" />}
              label="Compare"
              shortcut="⌘⇧C"
              onClick={onCompare}
              highlight
            />
          )}
        </>
      ) : (
        <>
          {onRun && (node.rendererKind === 'fit' || node.rendererKind === 'model_spec') && (
            <ToolbarButton
              icon={<Play className="size-4" />}
              label={node.rendererKind === 'fit' ? 'Fit' : 'Run'}
              shortcut="⌘↵"
              onClick={onRun}
              highlight
            />
          )}
          {onDuplicate && (
            <ToolbarButton
              icon={<Copy className="size-4" />}
              label="Duplicate"
              shortcut="⌘D"
              onClick={onDuplicate}
            />
          )}
          {onDelete && (
            <ToolbarButton
              icon={<Trash2 className="size-4" />}
              label="Delete"
              onClick={onDelete}
            />
          )}
        </>
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  highlight?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, shortcut, highlight, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
        highlight
          ? 'bg-sky-600 text-white hover:bg-sky-500'
          : 'text-slate-100 hover:bg-white/10 hover:text-white',
      )}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      {icon}
      <span>{label}</span>
      {shortcut && (
        <span className={cn('ml-1', highlight ? 'text-sky-100/80' : 'text-slate-400')}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
