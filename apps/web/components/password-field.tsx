'use client';

import { useState } from 'react';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
  variant?: 'default' | 'auth';
};

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  autoComplete = 'current-password',
  variant = 'default',
}: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  if (variant === 'auth') {
    return (
      <div className="space-y-1.5">
        <div className="relative">
          <input
            id={id}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            autoComplete={autoComplete}
            placeholder={label}
            className="auth-input h-auth-input w-full rounded-auth border-auth border-auth-line bg-auth-panel px-4 pb-2 pt-6 font-auth-body text-base text-auth-ink outline-none transition-colors duration-150 placeholder:text-transparent focus:border-auth-focus disabled:cursor-not-allowed disabled:opacity-70"
            aria-invalid={error ? 'true' : 'false'}
          />
          <label htmlFor={id} className="auth-floating-label">
            {label}
          </label>
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-pill px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-auth-muted transition-colors duration-150 hover:text-auth-ink disabled:cursor-not-allowed"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            disabled={disabled}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    );
  }

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
          autoComplete={autoComplete}
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
