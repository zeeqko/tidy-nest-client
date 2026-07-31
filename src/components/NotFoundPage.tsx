import { Link } from "react-router-dom";

/**
 * Catch-all for unknown routes inside the authenticated app shell (top bar/nav
 * still render around it). Modeled on CategoryPage's "Category not found" block.
 */
export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-heading text-xl font-semibold text-cute-text">Page not found</p>
      <Link to="/" className="font-body text-sm font-semibold text-cute-primary hover:underline">
        Back to Home
      </Link>
    </div>
  );
}
