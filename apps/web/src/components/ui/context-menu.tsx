import * as React from 'react';
import { useCallback, useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuState {
  readonly entries: ReadonlyArray<ContextMenuEntry>;
  readonly x: number;
  readonly y: number;
}

interface UseContextMenuResult {
  readonly menu: ContextMenuState | null;
  readonly show: (entries: ReadonlyArray<ContextMenuEntry>, x: number, y: number) => void;
  readonly hide: () => void;
}

const ITEM_HEIGHT = 32;
const SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 6;
const MAX_MENU_HEIGHT = 360;

export function useContextMenu(): UseContextMenuResult {
  const menuRef = useRef<ContextMenuState | null>(null);
  const [menu, setMenu] = useContextMenuState();

  const show = useCallback((entries: ReadonlyArray<ContextMenuEntry>, x: number, y: number) => {
    setMenu({ entries, x, y });
  }, [setMenu]);

  const hide = useCallback(() => {
    setMenu(null);
  }, [setMenu]);

  useEffect(() => {
    menuRef.current = menu;
  }, [menu]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current) {
        setMenu(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [setMenu]);

  return { menu, show, hide };
}

function useContextMenuState() {
  const [state, setState] = React.useState<ContextMenuState | null>(null);
  const setMenu = useCallback((next: ContextMenuState | null) => setState(next), []);
  return [state, setMenu] as const;
}

export function ContextMenuOverlay({ menu, hide }: { readonly menu: ContextMenuState; readonly hide: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (rect.right > viewportWidth) {
      containerRef.current.style.left = `${Math.max(4, viewportWidth - rect.width - 4)}px`;
    }

    if (rect.bottom > viewportHeight) {
      containerRef.current.style.top = `${Math.max(4, viewportHeight - rect.height - 4)}px`;
    }
  }, []);

  let totalHeight = MENU_PADDING * 2;
  for (const entry of menu.entries) {
    totalHeight += entry.separator ? SEPARATOR_HEIGHT : ITEM_HEIGHT;
  }
  const needsScroll = totalHeight > MAX_MENU_HEIGHT;
  const contentHeight = needsScroll ? MAX_MENU_HEIGHT : totalHeight;

  return (
    <div
      className="fixed inset-0 z-[9999]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
    >
      <div
        ref={containerRef}
        className="fixed z-[9999] min-w-[160px] max-w-[280px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-black/8"
        style={{
          left: menu.x,
          top: menu.y,
          maxHeight: `${contentHeight}px`,
        }}
        role="menu"
      >
        <div
          className={needsScroll ? 'overflow-y-auto overscroll-contain' : ''}
          style={{ maxHeight: `${contentHeight - MENU_PADDING * 2}px` }}
        >
          {menu.entries.map((entry, index) => {
            if (entry.separator) {
              return (
                <div
                  key={`sep-${index}`}
                  className="mx-2 my-1.5 h-px bg-slate-200"
                  role="separator"
                />
              );
            }

            return (
              <button
                key={entry.label}
                type="button"
                className={`flex w-full items-center px-3 text-left text-sm leading-none ${
                  entry.disabled
                    ? 'cursor-not-allowed px-3 py-2 text-slate-400'
                    : 'cursor-pointer px-3 py-2 text-slate-700 hover:bg-slate-100'
                }`}
                role="menuitem"
                disabled={entry.disabled}
                onClick={() => {
                  if (!entry.disabled) {
                    entry.action();
                    hide();
                  }
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
