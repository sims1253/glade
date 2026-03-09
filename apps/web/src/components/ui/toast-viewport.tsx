import { useEffect } from 'react';
import { AlertTriangle, CircleCheckBig } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useToastStore } from '../../store/toast';

const toneClassName = {
  success: 'border-emerald-500/40 bg-emerald-950/70 text-emerald-50',
  error: 'border-rose-500/40 bg-rose-950/70 text-rose-50',
} as const;

const toneIcon = {
  success: CircleCheckBig,
  error: AlertTriangle,
} as const;

export function ToastViewport() {
  const notifications = useToastStore((state) => state.notifications);
  const dismissNotification = useToastStore((state) => state.dismissNotification);

  useEffect(() => {
    const timeouts = notifications.map((notification) =>
      window.setTimeout(() => dismissNotification(notification.id), 4_500),
    );

    return () => {
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [dismissNotification, notifications]);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {notifications.map((notification) => {
        const Icon = toneIcon[notification.tone];
        return (
          <div
            key={notification.id}
            className={cn(
              'pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur',
              toneClassName[notification.tone],
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{notification.title}</p>
                {notification.description ? (
                  <p className="mt-1 text-sm opacity-90">{notification.description}</p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
