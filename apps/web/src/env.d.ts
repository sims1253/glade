import type { DesktopRuntimeInfo } from '@glade/shared';

declare global {
  interface Window {
    __GLADE_DESKTOP__?: DesktopRuntimeInfo;
  }
}

export {};
