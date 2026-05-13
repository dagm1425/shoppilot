import type {
  ForgotPasswordInput,
  LoginFormInput,
  RegisterFormInput,
  ResetPasswordInput,
} from './auth-form-schemas';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

type AuthUser = {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

type AuthResponse<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

function getApiBase(): string {
  if (!apiBase) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing.');
  }

  return apiBase;
}

async function parseResponse<T>(response: Response): Promise<AuthResponse<T>> {
  if (response.ok) {
    return {
      ok: true,
      data: (await response.json()) as T,
    };
  }

  let payload: ApiError = {};
  try {
    payload = (await response.json()) as ApiError;
  } catch {
    payload = {};
  }

  return {
    ok: false,
    message: payload.error?.message ?? 'Request failed.',
    code: payload.error?.code,
  };
}

export async function register(input: RegisterFormInput) {
  const response = await fetch(`${getApiBase()}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<{ user: AuthUser }>(response);
}

export async function login(input: LoginFormInput) {
  const response = await fetch(`${getApiBase()}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<{ user: AuthUser }>(response);
}

export async function logout() {
  const response = await fetch(`${getApiBase()}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  return parseResponse<{ message: string }>(response);
}

export async function fetchMe() {
  const response = await fetch(`${getApiBase()}/auth/me`, {
    credentials: 'include',
    cache: 'no-store',
  });

  return parseResponse<{ user: AuthUser }>(response);
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const response = await fetch(`${getApiBase()}/auth/password-reset/request`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<{ message: string; resetToken?: string }>(response);
}

export async function confirmPasswordReset(input: ResetPasswordInput) {
  const response = await fetch(`${getApiBase()}/auth/password-reset/confirm`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<{ message: string }>(response);
}
