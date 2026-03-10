import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopBridge, DesktopUpdateState } from '@glade/shared';

const desktopBridge: DesktopBridge = {
  getWsUrl: () => `ws://127.0.0.1:${Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842)}/ws`,
  pickFile: () => ipcRenderer.invoke('glade:select-file-path') as Promise<string | null>,
  pickExecutable: () => ipcRenderer.invoke('glade:select-executable-path') as Promise<string | null>,
  openDetachedTerminal: () => ipcRenderer.invoke('glade:open-detached-terminal') as Promise<boolean>,
  onDetachedTerminalState: (listener: (isDetached: boolean) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, isDetached: boolean) => listener(isDetached);
    ipcRenderer.on('glade:repl-detached-state', wrapped);
    return () => {
      ipcRenderer.removeListener('glade:repl-detached-state', wrapped);
    };
  },
  openExternal: (url: string) => ipcRenderer.invoke('glade:open-external', url) as Promise<boolean>,
  getUpdateState: () => ipcRenderer.invoke('glade:get-update-state') as Promise<DesktopUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('glade:check-for-updates') as Promise<DesktopUpdateState>,
  downloadUpdate: () => ipcRenderer.invoke('glade:download-update') as Promise<DesktopUpdateState>,
  installDownloadedUpdate: () => ipcRenderer.invoke('glade:install-downloaded-update') as Promise<boolean>,
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => listener(state);
    ipcRenderer.on('glade:update-state', wrapped);
    return () => {
      ipcRenderer.removeListener('glade:update-state', wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('desktopBridge', desktopBridge);
