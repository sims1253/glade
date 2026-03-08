import { contextBridge, ipcRenderer } from 'electron';

import { DESKTOP_GLOBAL_KEY } from '@glade/shared';

contextBridge.exposeInMainWorld(DESKTOP_GLOBAL_KEY, {
  platform: process.platform,
  serverPort: Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842),
  selectFilePath: () => ipcRenderer.invoke('glade:select-file-path') as Promise<string | null>,
  openDetachedTerminal: () => ipcRenderer.invoke('glade:open-detached-terminal') as Promise<boolean>,
  onDetachedTerminalStateChange: (listener: (isDetached: boolean) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, isDetached: boolean) => listener(isDetached);
    ipcRenderer.on('glade:repl-detached-state', wrapped);
    return () => {
      ipcRenderer.removeListener('glade:repl-detached-state', wrapped);
    };
  },
});
