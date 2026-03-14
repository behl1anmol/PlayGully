import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { AuthSession } from "@shared/schema";

interface AuthContextValue {
  session: AuthSession | null;
  sessionRef: React.MutableRefObject<AuthSession | null>;
  login: (session: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  sessionRef: { current: null },
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);

  const login = useCallback((s: AuthSession) => {
    sessionRef.current = s;
    setSession(s);
  }, []);
  const logout = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, sessionRef, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
