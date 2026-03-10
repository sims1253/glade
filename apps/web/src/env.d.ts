import type { DesktopBridge } from '@glade/shared';

declare global {
  const __GLADE_VERSION__: string;

  interface Window {
    desktopBridge?: DesktopBridge;
    __GLADE_EXTENSION_HOST__?: {
      React: typeof import('react');
      ReactDOM: typeof import('react-dom/client');
      ReactJsxDevRuntime: typeof import('react/jsx-dev-runtime');
      ReactJsxRuntime: typeof import('react/jsx-runtime');
    };
  }
}

export {};
