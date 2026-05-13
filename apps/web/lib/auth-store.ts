import { create } from 'zustand';

export type AuthUser = {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
};

type AuthUiState = {
  user: AuthUser | null;
  sessionChecked: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  setSessionChecked: (value: boolean) => void;
};

export const useAuthStore = create<AuthUiState>((set) => ({
  user: null,
  sessionChecked: false,
  setUser: (user) => set({ user, sessionChecked: true }),
  clearUser: () => set({ user: null, sessionChecked: true }),
  setSessionChecked: (value) => set({ sessionChecked: value }),
}));
