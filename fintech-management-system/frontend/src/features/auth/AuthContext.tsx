import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import type { AuthUser, LoginResponse } from "../../lib/types";

type LoginInput = {
  email: string;
  password: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  initializing: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      if (!token) {
        if (active) {
          setUser(null);
          setInitializing(false);
        }
        return;
      }

      try {
        const response = await api.get<AuthUser>("/auth/me");
        if (active) {
          setUser(response.data);
        }
      } catch {
        if (active) {
          localStorage.removeItem("auth_token");
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [token]);

  const login = async ({ email, password }: LoginInput) => {
    const response = await api.post<LoginResponse>("/auth/login", { email, password });
    const nextToken = response.data.access_token;
    localStorage.setItem("auth_token", nextToken);
    setToken(nextToken);

    const meResponse = await api.get<AuthUser>("/auth/me", {
      headers: {
        Authorization: `Bearer ${nextToken}`,
      },
    });
    setUser(meResponse.data);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ token, user, initializing, login, logout }),
    [token, user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
