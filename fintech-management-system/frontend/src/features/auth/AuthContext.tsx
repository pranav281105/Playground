import { createContext, useContext, useMemo, useState } from "react";

type AuthState = {
  token: string | null;
  setToken: (value: string | null) => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("auth_token"));

  const setToken = (value: string | null) => {
    setTokenState(value);
    if (value) {
      localStorage.setItem("auth_token", value);
      return;
    }
    localStorage.removeItem("auth_token");
  };

  const contextValue = useMemo(() => ({ token, setToken }), [token]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
