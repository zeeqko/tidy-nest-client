import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { AuthShell, authButtonClass, authInputClass } from "./AuthShell";

/** Standalone sign-in page (rendered outside AppLayout, per UI.pen). */
export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Where RequireAuth redirected from, so sign-in returns the user there.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell subtitle="Keep every drawer, shelf, and fridge shelf happily in its place.">
      <form className="flex w-full max-w-[400px] flex-col gap-5" onSubmit={handleSubmit}>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
        </label>
        <label className="flex w-full flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-cute-text">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
        </label>
        {error && (
          <p className="text-center font-body text-sm text-cute-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <p className="font-body text-sm text-cute-text-muted">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-cute-primary">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
