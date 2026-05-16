'use client';

import { LuMinus, LuPlus } from 'react-icons/lu';

type CartQuantityControlProps = {
  quantity: number;
  disabled?: boolean;
  canDecrease?: boolean;
  canIncrease?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function CartQuantityControl({
  quantity,
  disabled = false,
  canDecrease = true,
  canIncrease = true,
  onDecrease,
  onIncrease,
}: CartQuantityControlProps) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-background">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || !canDecrease}
        onClick={onDecrease}
        className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        <LuMinus className="size-3.5" aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-sm text-foreground">{quantity}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || !canIncrease}
        onClick={onIncrease}
        className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        <LuPlus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
