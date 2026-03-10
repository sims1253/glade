import { X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useWorkspaceStore, type CenterTab } from '../../store/workspace';

interface TabBarProps {
  className?: string;
}

function Tab({ tab, isActive, onClick, onClose }: {
  tab: CenterTab;
  isActive: boolean;
  onClick: () => void;
  onClose?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-2 rounded-t-lg border border-b-0 border-slate-200 px-4 py-2 text-sm transition-colors',
        isActive
          ? 'bg-white text-slate-900 font-medium shadow-sm relative'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-50',
        isActive && 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-white',
      )}
    >
      <span>{tab.icon}</span>
      <span>{tab.label}</span>
      {tab.closable && onClose && (
        <span
          aria-label={`Close ${tab.label} tab`}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          className={cn(
            'rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600',
            isActive && 'hover:bg-slate-100',
          )}
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  );
}

export function TabBar({ className }: TabBarProps) {
  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const removeTab = useWorkspaceStore((state) => state.removeTab);

  return (
    <div className={cn('flex items-end gap-1 bg-slate-100 px-2 pt-2', className)}>
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => setActiveTab(tab.id)}
          onClose={tab.closable ? () => removeTab(tab.id) : undefined}
        />
      ))}
    </div>
  );
}
