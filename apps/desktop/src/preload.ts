import { contextBridge } from 'electron';

import { DESKTOP_GLOBAL_KEY } from '@glade/shared';

contextBridge.exposeInMainWorld(DESKTOP_GLOBAL_KEY, {
  platform: process.platform,
  serverPort: Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842),
});
