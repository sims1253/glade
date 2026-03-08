import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  CircleAlert,
  CircleCheckBig,
  LoaderCircle,
  Lock,
  Milestone,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { formatKindLabel, type NodeVisualState, type WorkflowFlowNode } from '../../lib/graph-types';
import { useWorkflowCanvasContext } from './workflow-canvas-context';

interface NodeShellProps extends NodeProps<WorkflowFlowNode> {
  readonly accentClassName: string;
  readonly kindLabel?: string;
}

const statusIconMap: Record<NodeVisualState, typeof CircleCheckBig> = {
  ok: CircleCheckBig,
  warning: AlertTriangle,
  error: CircleAlert,
  stale: Milestone,
  pending: LoaderCircle,
  held: Lock,
  blocked: Lock,
};

const statusClassMap: Record<NodeVisualState, string> = {
  ok: 'border-emerald-400/40 text-emerald-200',
  warning: 'border-amber-400/50 text-amber-200',
  error: 'border-rose-400/60 text-rose-200',
  stale: 'border-slate-500/50 text-slate-300 italic',
  pending: 'border-sky-400/50 text-sky-200',
  held: 'border-violet-400/50 text-violet-200',
  blocked: 'border-orange-400/50 text-orange-200',
};

const cardClassMap: Record<NodeVisualState, string> = {
  ok: 'border-emerald-500/20 shadow-emerald-950/30',
  warning: 'border-amber-500/40 shadow-amber-950/30',
  error: 'border-rose-500/50 shadow-rose-950/30',
  stale: 'border-slate-700/90 opacity-80',
  pending: 'border-sky-500/40 shadow-sky-950/25',
  held: 'border-violet-500/40 shadow-violet-950/30',
  blocked: 'border-orange-500/40 shadow-orange-950/25',
};

export const NodeShell = memo(function NodeShell({
  data,
  accentClassName,
  kindLabel,
  selected,
}: NodeShellProps) {
  const {
    renamingNodeId,
    renameDraft,
    renamePending,
    connectionPreview,
    beginRename,
    cancelRename,
    commitRename,
    setRenameDraft,
  } = useWorkflowCanvasContext();
  const StatusIcon = statusIconMap[data.status];
  const badgeLabel = kindLabel ?? formatKindLabel(data.kind);
  const isRenaming = renamingNodeId === data.id;
  const isConnectionSource = connectionPreview?.sourceNodeId === data.id;
  const isValidTarget = connectionPreview?.validTargetIds.has(data.id) ?? false;
  const isInvalidTarget = connectionPreview?.invalidTargetIds.has(data.id) ?? false;
  const hasBlockingObligation = data.blockingObligationCount > 0;
  const blockReason = data.blockReason && data.blockReason !== 'none'
    ? data.blockReason.replace(/[_-]+/g, ' ')
    : null;
  const handleClassName = cn(
    '!h-3.5 !w-3.5 !border-2 !border-slate-950 shadow-lg transition-colors',
    isConnectionSource || selected
      ? '!bg-sky-300'
      : isValidTarget
        ? '!bg-emerald-300'
        : '!bg-slate-400',
  );
  // Connection affordances intentionally override passive selection/highlight rings.
  const ringClass = isValidTarget
    ? 'ring-2 ring-emerald-400/60'
    : isConnectionSource
      ? 'ring-2 ring-sky-400/60'
      : data.isHighlighted
        ? 'ring-2 ring-sky-400/65'
        : selected
          ? 'ring-2 ring-emerald-300/50'
          : null;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className={handleClassName}
        aria-label={`Connect into ${data.label}`}
      />
      <div
        className={cn(
          'relative min-w-[248px] rounded-2xl border bg-slate-950/95 p-4 shadow-xl backdrop-blur transition-colors',
          cardClassMap[data.status],
          ringClass,
          isInvalidTarget && 'opacity-40 saturate-50',
        )}
      >
        {hasBlockingObligation ? (
          <div
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-rose-400/60 bg-rose-500/18 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-50"
            role="status"
            aria-label={`${data.blockingObligationCount} blocking obligation${data.blockingObligationCount === 1 ? '' : 's'}`}
          >
            <Lock className="size-3.5" />
            locked
          </div>
        ) : null}
        <div className={cn('rounded-xl border border-white/8 bg-linear-to-br p-3', accentClassName)}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                {badgeLabel}
              </span>
              <div onDoubleClick={() => beginRename(data.id, data.label)}>
                {isRenaming ? (
                  <input
                    value={renameDraft}
                    autoFocus
                    disabled={renamePending}
                    onBlur={() => commitRename()}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void commitRename();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    className="w-full rounded-lg border border-emerald-400/40 bg-slate-950/90 px-2 py-1 text-sm font-semibold text-slate-50 outline-hidden"
                  />
                ) : (
                  <h3 className="cursor-text text-sm font-semibold text-slate-50">{data.label}</h3>
                )}
                <p className="mt-1 text-xs text-slate-400">id: {data.id}</p>
              </div>
            </div>
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium capitalize', statusClassMap[data.status])}>
              <StatusIcon className={cn('size-3.5', data.status === 'pending' && 'animate-spin')} />
              {data.status}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-300">
            <span>{data.obligationCount} obligation{data.obligationCount === 1 ? '' : 's'}</span>
            <span className="text-slate-400">{blockReason ?? 'interactive'}</span>
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className={handleClassName}
        aria-label={`Connect from ${data.label}`}
      />
    </>
  );
});
