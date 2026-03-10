import { createFileRoute } from '@tanstack/react-router';

import { ReplTerminalPanel } from '../components/repl/repl-terminal-panel';
import { useServerSession } from '../lib/server-session-context';

export const Route = createFileRoute('/terminal')({
  component: TerminalRoute,
});

export function TerminalRoute() {
  const { rpc } = useServerSession();

  return (
    <section className="min-h-screen bg-[#050b14]">
      <ReplTerminalPanel detachedView repl={rpc.repl} />
    </section>
  );
}
