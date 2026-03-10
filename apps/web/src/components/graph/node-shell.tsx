import { memo, type ReactNode } from 'react';
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
  readonly children?: ReactNode;
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
  ok: 'border-emerald-200 text-emerald-700',
  warning: 'border-amber-200 text-amber-700',
  error: 'border-rose-200 text-rose-700',
  stale: 'border-slate-200 text-slate-500 italic',
  pending: 'border-sky-200 text-sky-700',
  held: 'border-violet-200 text-violet-700',
  blocked: 'border-orange-200 text-orange-700',
};

const cardClassMap: Record<NodeVisualState, string> = {
  ok: 'border-slate-200 shadow-slate-200/80',
  warning: 'border-amber-200 shadow-amber-100/80',
  error: 'border-rose-200 shadow-rose-100/80',
  stale: 'border-slate-200 opacity-80',
  pending: 'border-sky-200 shadow-sky-100/80',
  held: 'border-violet-200 shadow-violet-100/80',
  blocked: 'border-orange-200 shadow-orange-100/80',
};

export const NodeShell = memo(function NodeShell({
  data,
  accentClassName,
  kindLabel,
  children,
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
    '!h-3.5 !w-3.5 !border-2 !border-white shadow-md transition-colors',
    isConnectionSource || selected
      ? '!bg-sky-500'
      : isValidTarget
        ? '!bg-emerald-500'
        : '!bg-slate-300',
  );
  // Connection affordances intentionally override passive selection/highlight rings.
  const ringClass = isValidTarget
    ? 'ring-2 ring-emerald-400/60'
    : isConnectionSource
      ? 'ring-2 ring-sky-400/60'
      : data.isHighlighted
        ? 'ring-2 ring-sky-400/65'
        : selected
          ? 'ring-2 ring-sky-300/60'
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
          'relative min-w-[248px] rounded-2xl border bg-white p-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.28)] transition-colors',
          cardClassMap[data.status],
          ringClass,
          isInvalidTarget && 'opacity-40 saturate-50',
        )}
      >
        {hasBlockingObligation ? (
          <div
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700"
            role="status"
            aria-label={`${data.blockingObligationCount} blocking obligation${data.blockingObligationCount === 1 ? '' : 's'}`}
          >
            <Lock className="size-3.5" />
            locked
          </div>
        ) : null}
        <div className={cn('rounded-xl border border-slate-200 bg-linear-to-br p-3', accentClassName)}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-white/70 bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 shadow-xs">
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
                    className="w-full rounded-lg border border-sky-300 bg-white/90 px-2 py-1 text-sm font-semibold text-slate-900 outline-hidden"
                  />
                ) : (
                  <h3 className="cursor-text text-sm font-semibold text-slate-900">{data.label}</h3>
                )}
                <p className="mt-1 text-xs text-slate-500">id: {data.id}</p>
              </div>
            </div>
            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium capitalize', statusClassMap[data.status])}>
              <StatusIcon className={cn('size-3.5', data.status === 'pending' && 'animate-spin')} />
              {data.status}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
            <span>{data.obligationCount} obligation{data.obligationCount === 1 ? '' : 's'}</span>
            <span className="text-slate-500">{blockReason ?? 'interactive'}</span>
          </div>
          {children ? (
            <div className="mt-4 border-t border-slate-200/80 pt-3">
              {children}
            </div>
          ) : null}
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
