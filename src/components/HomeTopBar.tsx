import { useEffect, useState } from "react";
import { Menu, User, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { logout } from "../api/auth";
import { useCurrentUser } from "./RequireAuth";

interface HomeTopBarProps {
  onMenuClick: () => void;
  menuOpen?: boolean;
  className?: string;
}

export function HomeTopBar({ onMenuClick, menuOpen, className }: HomeTopBarProps) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const initial = user.name.trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [accountMenuOpen]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      // The session is gone (or was already invalid) — either way, back to sign-in.
      navigate("/signin", { replace: true });
    }
  };

  return (
    <div
      className={`w-full items-center justify-between px-5 py-4 sm:px-12 sm:py-6 ${className ?? "flex"}`}
    >
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          aria-expanded={menuOpen ?? false}
          aria-haspopup="menu"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95"
        >
          <Menu size={18} />
        </button>
        <Link
          to="/"
          className="font-heading text-2xl font-semibold text-cute-primary transition hover:brightness-95"
        >
          Tidy Nest
        </Link>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((open) => !open)}
          aria-label="Account menu"
          aria-expanded={accountMenuOpen}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-cute-secondary font-heading text-sm font-medium text-cute-secondary-foreground transition hover:brightness-95"
        >
          {initial}
        </button>
        {accountMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30 bg-[#4A3F5555]"
              onClick={() => setAccountMenuOpen(false)}
            />
            <div className="absolute right-0 top-12 z-40 flex w-[200px] flex-col gap-0.5 rounded-cute-m border border-cute-border bg-cute-surface p-2.5 shadow-[0_12px_28px_-6px_rgba(74,63,85,0.19)]">
              <div className="border-b border-cute-border px-3 pt-1 pb-2.5">
                <p className="truncate font-heading text-sm font-semibold text-cute-text">
                  {user.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAccountMenuOpen(false)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-[11px] font-body text-sm text-cute-text-muted transition hover:bg-cute-surface-alt"
              >
                <User size={17} />
                Profile
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-[11px] font-body text-sm text-cute-danger transition hover:bg-cute-surface-alt disabled:opacity-60"
              >
                <LogOut size={17} />
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
