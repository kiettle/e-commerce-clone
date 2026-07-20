import type { Session } from '@/types/api';

const SESSION_KEY = 'marketflow.session';

export function readSession(): Session | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;

    const session: unknown = JSON.parse(value);
    return isSession(session) ? session : null;
  } catch {
    return null;
  }
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;

  const session = value as Record<string, unknown>;
  return (
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof session.email === 'string' &&
    session.email.length > 0 &&
    Number.isInteger(session.userId) &&
    Number(session.userId) > 0
  );
}

export function writeSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
