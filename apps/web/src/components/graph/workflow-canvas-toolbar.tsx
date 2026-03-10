import { useEffect, useRef, useState } from 'react';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface WorkflowCanvasToolbarProps {
  readonly summary: string;
  readonly onAddNode: () => void;
  readonly onAutoArrange: () => void;
}

export function WorkflowCanvasToolbar({
  summary,
  onAddNode,
  onAutoArrange,
}: WorkflowCanvasToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLParagraphElement | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return;
    }

    const syncCompact = () => {
      const controlsWidth = controlsRef.current?.scrollWidth ?? 0;
      const summaryWidth = summaryRef.current?.scrollWidth ?? 0;
      const padding = 24;
      setCompact((controlsWidth + summaryWidth + padding) > toolbar.clientWidth);
    };

    syncCompact();
    const observer = new ResizeObserver(syncCompact);
    observer.observe(toolbar);

    return () => observer.disconnect();
  }, [summary]);

  return (
    <div
      ref={toolbarRef}
      className={cn(
        'absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-slate-200 bg-white/92 px-3 py-2 text-xs text-slate-600 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.28)] backdrop-blur',
        compact ? 'flex-col items-stretch' : 'flex-row',
      )}
    >
      <div ref={controlsRef} className="flex shrink-0 items-center gap-2">
        <Button className="px-3 py-1.5 text-xs" onClick={onAddNode}>
          Add node
        </Button>
        <Button className="px-3 py-1.5 text-xs" onClick={() => void onAutoArrange()} variant="ghost">
          Auto arrange
        </Button>
      </div>
      <div className={cn('min-w-0', compact ? 'border-t border-slate-200 pt-2' : 'ml-auto')}>
        <p ref={summaryRef} className="truncate text-slate-700">{summary}</p>
        {!compact ? (
          <p className="mt-1 truncate text-slate-500">Drag from a bottom port to a top port to connect nodes.</p>
        ) : null}
      </div>
    </div>
  );
}
