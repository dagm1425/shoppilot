'use client';

import { useState } from 'react';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-sm text-foreground">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete="current-password"
          className="w-full bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          placeholder="Enter your password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          className="text-xs font-medium text-primary"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          disabled={disabled}
        >
          {showPassword ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}
