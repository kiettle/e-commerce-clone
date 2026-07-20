import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { clearSession, readSession, writeSession } from '@/lib/session';
import type { Session } from '@/types/api';

interface AuthContextValue {
  session: Session | null;
  isRestoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [isRestoring, setIsRestoring] = useState(Boolean(session));
  const restorePromise = useRef<Promise<Session | null> | null>(null);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) return;

    restorePromise.current ??= api
      .validate(session.token)
      .then((user) => {
        return { ...session, userId: user.userId };
      })
      .catch(() => null);

    let isActive = true;
    void restorePromise.current
      .then((restored) => {
        if (!isActive) return;
        if (!restored) {
          logout();
          return;
        }
        writeSession(restored);
        setSession(restored);
      })
      .finally(() => {
        if (isActive) setIsRestoring(false);
      });

    return () => {
      isActive = false;
    };
    // The initial token is the only value that should trigger restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token } = await api.login(email, password);
    const user = await api.validate(token);
    const nextSession = { token, email, userId: user.userId };
    writeSession(nextSession);
    setSession(nextSession);
  }, []);

  const value = useMemo(
    () => ({ session, isRestoring, login, logout }),
    [session, isRestoring, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
