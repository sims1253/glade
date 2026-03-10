// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowCanvasToolbar } from './workflow-canvas-toolbar';

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');

describe('WorkflowCanvasToolbar', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      disconnect() {}
    });

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        const className = typeof this.className === 'string' ? this.className : '';
        return className.includes('absolute left-4 top-4') ? 260 : 0;
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        const text = this.textContent ?? '';
        if (text.includes('Add node') && text.includes('Auto arrange')) {
          return 120;
        }
        if (text.includes('3 nodes')) {
          return 80;
        }
        if (text.includes('10 nodes')) {
          return 220;
        }
        return 0;
      },
    });
  });

  afterEach(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    }
    if (originalScrollWidth) {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', originalScrollWidth);
    }
    vi.unstubAllGlobals();
  });

  it('recomputes compact mode when the summary changes', async () => {
    const { rerender } = render(
      <WorkflowCanvasToolbar
        summary="3 nodes"
        onAddNode={() => {}}
        onAutoArrange={() => {}}
      />,
    );

    expect(screen.getByText('Drag from a bottom port to a top port to connect nodes.')).toBeInTheDocument();

    rerender(
      <WorkflowCanvasToolbar
        summary="10 nodes · 25 edges · 7 kinds"
        onAddNode={() => {}}
        onAutoArrange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('Drag from a bottom port to a top port to connect nodes.')).not.toBeInTheDocument();
    });
  });
});
