import { contextBridge, ipcRenderer } from 'electron';

import { DESKTOP_GLOBAL_KEY } from '@glade/shared';

contextBridge.exposeInMainWorld(DESKTOP_GLOBAL_KEY, {
  platform: process.platform,
  serverPort: Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842),
  selectFilePath: () => ipcRenderer.invoke('glade:select-file-path') as Promise<string | null>,
});
