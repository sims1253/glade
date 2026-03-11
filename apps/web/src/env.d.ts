import type { DesktopBridge } from '@glade/shared';

declare global {
  const __GLADE_VERSION__: string;

  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export {};
