import type { ReactNode } from 'react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, createBrowserHistory } from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient();

export const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
  context: {
    queryClient,
  },
  Wrap: ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
