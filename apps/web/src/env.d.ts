import type { DesktopRuntimeInfo } from '@glade/shared';

declare global {
  interface Window {
    __GLADE_DESKTOP__?: DesktopRuntimeInfo;
    __GLADE_EXTENSION_HOST__?: {
      React: typeof import('react');
      ReactDOM: typeof import('react-dom/client');
      ReactJsxDevRuntime: typeof import('react/jsx-dev-runtime');
      ReactJsxRuntime: typeof import('react/jsx-runtime');
    };
  }
}

export {};
