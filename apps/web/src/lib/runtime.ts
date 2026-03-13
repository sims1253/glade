import type { DesktopEnvironmentState, DesktopSettings } from '@glade/contracts';
import type { DesktopBridge, DesktopUpdateState } from '@glade/shared';

import type { RpcCallResult, RpcClient } from './rpc';

function unwrapRpc<TResult>(result: RpcCallResult<TResult>): TResult {
  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.result;
}

export class SessionRestartAfterEnvironmentUpdateError extends Error {
  override readonly name = 'SessionRestartAfterEnvironmentUpdateError';
  readonly environment: DesktopEnvironmentState;
  override readonly cause: unknown;

  constructor(message: string, environment: DesktopEnvironmentState, cause: unknown) {
    super(message, { cause });
    this.environment = environment;
    this.cause = cause;
  }
}

export function readDesktopBridge(): DesktopBridge | undefined {
  return window.desktopBridge;
}

export function isDesktopRuntime() {
  return Boolean(readDesktopBridge());
}

export function hasNativeFilePicker() {
  return typeof readDesktopBridge()?.pickFile === 'function';
}

export function canDetachTerminal() {
  return typeof readDesktopBridge()?.openDetachedTerminal === 'function';
}

export function subscribeToDetachedTerminalState(listener: (isDetached: boolean) => void) {
  return readDesktopBridge()?.onDetachedTerminalState?.(listener) ?? (() => {});
}

export function websocketUrl() {
  const bridgeUrl = readDesktopBridge()?.getWsUrl?.();
  if (bridgeUrl) {
    return bridgeUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function createNativeApi(rpc: RpcClient) {
  const bridge = readDesktopBridge();

  const restartSession = async () => {
    unwrapRpc(await rpc.session.restart());
  };

  const restartAfterEnvironmentUpdate = async (
    environment: DesktopEnvironmentState,
    actionLabel: string,
  ) => {
    try {
      await restartSession();
    } catch (error) {
      throw new SessionRestartAfterEnvironmentUpdateError(
        `${actionLabel} succeeded, but restarting the session failed.`,
        environment,
        error,
      );
    }
  };

  const saveEnvironment = async (settings: DesktopSettings): Promise<DesktopEnvironmentState> => {
    const environment = unwrapRpc(await rpc.desktop.saveSettings({ settings }));
    await restartAfterEnvironmentUpdate(environment, 'Saving desktop settings');
    return environment;
  };

  const resetEnvironment = async (): Promise<DesktopEnvironmentState> => {
    const environment = unwrapRpc(await rpc.desktop.resetSettings());
    await restartAfterEnvironmentUpdate(environment, 'Resetting desktop settings');
    return environment;
  };

  const refreshEnvironment = async (): Promise<DesktopEnvironmentState> => {
    const environment = unwrapRpc(await rpc.desktop.refreshEnvironment());
    await restartAfterEnvironmentUpdate(environment, 'Refreshing desktop environment');
    return environment;
  };

  return {
    bridge,
    environment: {
      getState: async () => unwrapRpc(await rpc.desktop.getEnvironment()),
      refresh: refreshEnvironment,
      saveSettings: saveEnvironment,
      resetSettings: resetEnvironment,
    },
    pickFile: async () => bridge?.pickFile?.() ?? null,
    pickDirectory: async () => bridge?.pickDirectory?.() ?? null,
    pickExecutable: async () => bridge?.pickExecutable?.() ?? null,
    openDetachedTerminal: async () => bridge?.openDetachedTerminal?.() ?? false,
    openExternal: async (url: string) => {
      if (bridge?.openExternal) {
        return bridge.openExternal(url);
      }

      return window.open(url, '_blank', 'noopener,noreferrer') !== null;
    },
    updater: {
      supported: Boolean(bridge),
      getState: async (): Promise<DesktopUpdateState | null> => bridge?.getUpdateState?.() ?? null,
      check: async (): Promise<DesktopUpdateState> => {
        if (!bridge?.checkForUpdates) {
          throw new Error('Updater is unavailable in this runtime.');
        }
        return bridge.checkForUpdates();
      },
      download: async (): Promise<DesktopUpdateState> => {
        if (!bridge?.downloadUpdate) {
          throw new Error('Updater is unavailable in this runtime.');
        }
        return bridge.downloadUpdate();
      },
      install: async () => bridge?.installDownloadedUpdate?.() ?? false,
      subscribe: (listener: (state: DesktopUpdateState) => void) => bridge?.onUpdateState?.(listener) ?? (() => {}),
    },
  };
}
