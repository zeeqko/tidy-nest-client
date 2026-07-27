import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { me, type AuthUser } from "../api/auth";

const AuthContext = createContext<AuthUser | null>(null);

/** The signed-in user; only usable under RequireAuth, where it is always set. */
export function useCurrentUser(): AuthUser {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useCurrentUser must be used inside RequireAuth");
  return user;
}

/**
 * Route guard: resolves the session cookie via /api/auth/me before rendering
 * the app shell, redirecting anonymous visitors to /signin (remembering where
 * they were headed so the sign-in page can return them there). The resolved
 * user is provided to descendants via useCurrentUser().
 */
export function RequireAuth() {
  const [state, setState] = useState<{ checked: boolean; user: AuthUser | null }>({
    checked: false,
    user: null,
  });
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    me()
      .then((user) => {
        if (!cancelled) setState({ checked: true, user });
      })
      .catch(() => {
        if (!cancelled) setState({ checked: true, user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state.checked) return <div className="min-h-dvh w-full bg-cute-bg" />;
  if (!state.user) return <Navigate to="/signin" replace state={{ from: location }} />;
  return (
    <AuthContext.Provider value={state.user}>
      <Outlet />
    </AuthContext.Provider>
  );
}
