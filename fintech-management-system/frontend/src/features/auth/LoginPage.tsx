import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/dashboard";

  if (token) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>FinTech Management System</h1>
        <p>Sign in to continue.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
