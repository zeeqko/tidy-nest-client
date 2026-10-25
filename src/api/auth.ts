import { resetAllResources } from "../lib/resourceCache";
import { request } from "./http";

/** Authenticated user as served by the Go backend (email is not exposed). */
export interface AuthUser {
  id: number;
  name: string;
  profileImageURL: string | null;
  currency: string;
}

/** Resolves the current session, or null when not signed in. */
export async function me(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return null;
  return response.json();
}

/** Signs in with email/password; the backend sets the session cookie. */
export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  // Drop the previous user's cached lists now that the new session cookie is set.
  resetAllResources();
  return user;
}

/** Revokes the session server-side and clears the cookie. */
export async function logout(): Promise<void> {
  try {
    await request<void>("/api/auth/logout", { method: "POST" });
  } finally {
    // Clear even if the request fails; a refetch would only 401.
    resetAllResources({ refetch: false });
  }
}

/**
 * Creates an account and signs it in (the backend sets the session cookie).
 * The password is only ever sent in the request body; the server stores an
 * argon2id hash, never the plaintext.
 */
export async function signup(name: string, email: string, password: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  resetAllResources();
  return user;
}
