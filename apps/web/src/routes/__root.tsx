import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { APP_DISPLAY_NAME } from '@glade/shared';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootRoute,
  head: () => ({
    meta: [{ title: APP_DISPLAY_NAME }],
  }),
});

function RootRoute() {
  return (
    <main className="min-h-screen px-6 py-8 text-slate-100 sm:px-10">
      <Outlet />
    </main>
  );
}
