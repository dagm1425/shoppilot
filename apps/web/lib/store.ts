import { create } from 'zustand';

type UiState = {
  diagnosticsEnabled: boolean;
  setDiagnosticsEnabled: (enabled: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  diagnosticsEnabled: true,
  setDiagnosticsEnabled: (enabled) => set({ diagnosticsEnabled: enabled }),
}));
