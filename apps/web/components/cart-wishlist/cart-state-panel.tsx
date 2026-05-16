import type { ReactNode } from 'react';
import { StatePanel } from '../state-panel';

type CartStatePanelProps = {
  state: 'loading' | 'empty' | 'error' | 'success' | 'disabled';
  title: string;
  description: string;
  children?: ReactNode;
};

export function CartStatePanel({ state, title, description, children }: CartStatePanelProps) {
  return (
    <StatePanel variant={state} title={title} description={description}>
      {children}
    </StatePanel>
  );
}
