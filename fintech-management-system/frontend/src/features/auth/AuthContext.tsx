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
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    async function bootstrapFromToken() {
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
          setTokenState(null);
          localStorage.removeItem("auth_token");
          setUser(null);
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    }

    void bootstrapFromToken();

    return () => {
      active = false;
    };
  }, [token]);

  const login = async (input: LoginInput) => {
    const body = new URLSearchParams();
    body.append("username", input.email);
    body.append("password", input.password);

    const loginResponse = await api.post<LoginResponse>("/auth/login", body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const nextToken = loginResponse.data.access_token;
    setTokenState(nextToken);
    localStorage.setItem("auth_token", nextToken);

    const meResponse = await api.get<AuthUser>("/auth/me", {
      headers: {
        Authorization: `Bearer ${nextToken}`,
      },
    });

    setUser(meResponse.data);
  };

  const logout = () => {
    setTokenState(null);
    setUser(null);
    localStorage.removeItem("auth_token");
  };

  const contextValue = useMemo(
    () => ({
      token,
      user,
      initializing,
      login,
      logout,
    }),
    [token, user, initializing],
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
