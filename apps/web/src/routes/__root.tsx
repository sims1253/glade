import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { APP_DISPLAY_NAME } from '@glade/shared';

import { ConnectionStatusSurface } from '../components/connection-status-surface';
import { ServerSessionProvider } from '../lib/server-session-context';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootRoute,
  head: () => ({
    meta: [{ title: APP_DISPLAY_NAME }],
  }),
});

function RootRoute() {
  return (
    <ServerSessionProvider>
      <ConnectionStatusSurface>
        <main className="min-h-screen">
          <Outlet />
        </main>
      </ConnectionStatusSurface>
    </ServerSessionProvider>
  );
}
