import { useConnectionStore } from './connection';
import { useReplStore } from './repl';
import { useToastStore } from './toast';
import { useUiPrefsStore } from './ui-prefs';

function snapshot() {
  const connection = useConnectionStore.getState();
  const toast = useToastStore.getState();
  const repl = useReplStore.getState();
  const uiPrefs = useUiPrefsStore.getState();

  return {
    serverConnected: connection.serverConnected,
    serverVersion: connection.serverVersion,
    sessionState: connection.sessionState,
    sessionReason: connection.sessionReason,
    notifications: toast.notifications,
    replLines: repl.replLines,
    rawLines: repl.rawLines,
    replPanelOpen: uiPrefs.replPanelOpen,
    replPanelHeight: uiPrefs.replPanelHeight,
    replDetached: repl.replDetached,
  };
}

type AppSnapshot = ReturnType<typeof snapshot>;

type ConnectionPatch = {
  serverVersion?: string | null;
  sessionState?: AppSnapshot['sessionState'];
  sessionReason?: string | null;
};

type ReplPatch = {
  replLines?: AppSnapshot['replLines'];
  rawLines?: AppSnapshot['rawLines'];
  replDetached?: AppSnapshot['replDetached'];
};

type UiPrefsPatch = {
  replPanelOpen?: AppSnapshot['replPanelOpen'];
  replPanelHeight?: AppSnapshot['replPanelHeight'];
};

export const useAppStore = Object.assign(
  <T>(selector: (state: AppSnapshot) => T) => selector(snapshot()),
  {
    getState: snapshot,
    setState(partial: Partial<AppSnapshot>) {
      const nextConnectionState: ConnectionPatch = {};
      const nextReplState: ReplPatch = {};
      const nextUiPrefsState: UiPrefsPatch = {};

      if (partial.serverConnected === false && partial.sessionReason) {
        useConnectionStore.getState().markDisconnected(partial.sessionReason);
      } else if (partial.serverConnected === true) {
        useConnectionStore.getState().markConnecting();
      }

      if (partial.serverVersion !== undefined) {
        nextConnectionState.serverVersion = partial.serverVersion;
      }
      if ((partial.sessionState !== undefined || partial.sessionReason !== undefined) && partial.serverConnected !== false) {
        nextConnectionState.sessionState = partial.sessionState ?? useConnectionStore.getState().sessionState;
        nextConnectionState.sessionReason = partial.sessionReason ?? useConnectionStore.getState().sessionReason;
      }

      if (Object.keys(nextConnectionState).length > 0) {
        useConnectionStore.setState(nextConnectionState);
      }

      if (partial.notifications !== undefined) {
        useToastStore.setState({ notifications: partial.notifications });
      }
      if (partial.replLines !== undefined) {
        nextReplState.replLines = partial.replLines;
      }
      if (partial.rawLines !== undefined) {
        nextReplState.rawLines = partial.rawLines;
      }
      if (partial.replPanelOpen !== undefined) {
        nextUiPrefsState.replPanelOpen = partial.replPanelOpen;
      }
      if (partial.replPanelHeight !== undefined) {
        nextUiPrefsState.replPanelHeight = partial.replPanelHeight;
      }
      if (partial.replDetached !== undefined) {
        nextReplState.replDetached = partial.replDetached;
      }

      if (Object.keys(nextReplState).length > 0) {
        useReplStore.setState(nextReplState);
      }

      if (Object.keys(nextUiPrefsState).length > 0) {
        useUiPrefsStore.setState(nextUiPrefsState);
      }
    },
  },
);
