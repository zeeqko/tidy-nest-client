import { useEffect } from "react";
import type { FormEvent, MouseEvent, ReactNode, Ref } from "react";
import { ChevronLeft, X } from "lucide-react";

/**
 * Single source of truth for every modal/portal layer's stacking order.
 * `base` < `raised` < `elevated` < `alert` covers the five modals (see
 * `ModalShell`'s `level` prop); `pickerOverlay`/`pickerPanel` are for
 * `OptionPicker`'s portalled dropdown, which must out-rank every modal
 * layer (including `alert`, since a picker can be open inside a form that's
 * itself stacked under nothing higher) rather than a hand-picked number.
 */
export const MODAL_Z = {
  base: 50,
  raised: 60,
  elevated: 70,
  alert: 80,
  pickerOverlay: 90,
  pickerPanel: 95,
} as const;

export type ModalLevel = Extract<keyof typeof MODAL_Z, "base" | "raised" | "elevated" | "alert">;

/**
 * Tailwind's scanner needs each arbitrary-value class to appear as a literal
 * string somewhere in scanned source; it can't see through a
 * `` `z-[${MODAL_Z[level]}]` `` interpolation, so the actual class names are
 * spelled out here (values kept in sync with `MODAL_Z` above) and consumed
 * as-is by both `ModalShell` and `OptionPicker`.
 */
export const MODAL_Z_CLASS: Record<keyof typeof MODAL_Z, string> = {
  base: "z-[50]",
  raised: "z-[60]",
  elevated: "z-[70]",
  alert: "z-[80]",
  pickerOverlay: "z-[90]",
  pickerPanel: "z-[95]",
};

const PAGE_OVERLAY_CLASS =
  "fixed inset-0 flex items-center justify-center bg-cute-bg pt-[env(safe-area-inset-top)] sm:bg-[#4A3F5555] sm:p-6 sm:pt-6";

const ALERT_OVERLAY_CLASS =
  "fixed inset-0 flex items-center justify-center bg-[#4A3F5555] p-4 sm:p-6";

const CARD_SHADOW = "shadow-[0_20px_50px_-10px_rgba(74,63,85,0.19)]";

const DEFAULT_BODY_CLASS = "gap-5 px-5 py-4 sm:p-8 sm:pt-5";

const DEFAULT_FOOTER_CLASS =
  "w-full shrink-0 border-t border-cute-border bg-cute-surface px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:border-0 sm:bg-transparent sm:px-8 sm:pt-0 sm:pb-8";

const DEFAULT_TITLE_CLASS =
  "truncate font-heading text-xl font-semibold text-cute-text sm:text-[22px]";

interface ModalShellPageProps {
  /** "page" (default): full-screen on mobile, centered card on `sm`+, with a
   * back-chevron/X header. "alert": centered small card at every breakpoint
   * (for `ConfirmDeleteModal` — an alert isn't a page). */
  variant?: "page" | "alert";
  /** Stacking layer — see `MODAL_Z`. */
  level: ModalLevel;
  onClose: () => void;
  /**
   * Escape and backdrop-click call this before closing; if it returns
   * `false` the close is skipped (e.g. a nested picker/dialog is open and
   * should absorb that Escape press instead). Omit to always allow closing.
   */
  closeGuard?: () => boolean;
  /** Header title (page variant only). Accepts a node so e.g. `ItemDetailModal`
   * can pass a breadcrumb instead of plain text. */
  title?: ReactNode;
  titleClassName?: string;
  /** Rendered as an `<h2>` (accessible modal heading) by default; `ItemDetailModal`
   * passes "div" since its header holds a breadcrumb, not the item's real
   * title (that's an `<h2>` in the body instead). */
  titleAs?: "h2" | "div";
  /** Optional header subtitle, hidden below `sm` (page variant only). */
  subtitle?: ReactNode;
  /** Optional extra header content rendered between the title and the X button. */
  headerRight?: ReactNode;
  /** Optional sticky footer (page variant only). */
  footer?: ReactNode;
  footerClassName?: string;
  bodyClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
  /** e.g. `"sm:max-w-[520px]"` — desktop card width (page variant only). */
  maxWidthClassName?: string;
  /** Render the card as a `<form>` instead of a `<div>` (e.g. `ItemFormModal`). */
  as?: "div" | "form";
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Omit the mobile back-chevron header button (page variant only). Use for
   *  a modal meant to feel like a tab's page rather than a stacked flow —
   *  the caller is responsible for another way to dismiss it. */
  hideMobileBackButton?: boolean;
  /** Render below `BottomNav` on mobile (z-30, under its z-40) instead of
   *  covering it, and reserve `pb-24` at the bottom of the body so content
   *  isn't hidden behind the nav. No effect at `sm`+, where `BottomNav`
   *  doesn't render. */
  belowBottomNav?: boolean;
  children: ReactNode;
}

/**
 * Shared chrome for all five modals: overlay, full-screen-on-mobile /
 * centered-on-desktop card, header (back-chevron below `sm`, X at `sm`+,
 * title/subtitle/right slot), scrollable body, optional sticky footer, and
 * centralized Escape/backdrop-close (see `closeGuard`).
 */
export function ModalShell({
  variant = "page",
  level,
  onClose,
  closeGuard,
  title,
  titleClassName,
  titleAs = "h2",
  subtitle,
  headerRight,
  footer,
  footerClassName,
  bodyClassName,
  bodyRef,
  maxWidthClassName,
  as = "div",
  onSubmit,
  hideMobileBackButton,
  belowBottomNav,
  children,
}: ModalShellPageProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (closeGuard && !closeGuard()) return;
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, closeGuard]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (closeGuard && !closeGuard()) return;
    onClose();
  };

  // Sits under BottomNav's z-40 on mobile so the nav stays visible/usable
  // above this modal's card, instead of the modal covering it; unaffected at
  // sm+, where BottomNav doesn't render.
  const zIndexClass = belowBottomNav ? "z-30 sm:z-[50]" : MODAL_Z_CLASS[level];

  if (variant === "alert") {
    return (
      <div
        className={`${ALERT_OVERLAY_CLASS} ${zIndexClass}`}
        onClick={handleBackdropClick}
      >
        <div
          className={`flex w-full max-w-[420px] flex-col items-center gap-4 rounded-cute-l bg-cute-surface p-8 text-center ${CARD_SHADOW}`}
        >
          {children}
        </div>
      </div>
    );
  }

  const cardClassName = `flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90vh] ${
    maxWidthClassName ?? ""
  } sm:rounded-cute-l sm:bg-cute-surface ${CARD_SHADOW}`;

  const cardContent = (
    <>
      <div className="flex w-full items-center gap-3.5 px-5 pt-5 pb-3 sm:items-start sm:justify-between sm:p-8 sm:pb-0">
        {!hideMobileBackButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:hidden"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col sm:gap-1">
          {titleAs === "div" ? (
            <div className={titleClassName ?? DEFAULT_TITLE_CLASS}>{title}</div>
          ) : (
            <h2 className={titleClassName ?? DEFAULT_TITLE_CLASS}>{title}</h2>
          )}
          {subtitle && (
            <p className="hidden font-body text-[13px] text-cute-text-muted sm:block">
              {subtitle}
            </p>
          )}
        </div>
        {headerRight}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="hidden h-9 w-9 items-center justify-center rounded-full bg-cute-surface-alt text-cute-text transition hover:brightness-95 sm:flex"
        >
          <X size={16} />
        </button>
      </div>

      <div
        ref={bodyRef}
        className={`flex min-h-0 w-full flex-1 flex-col overflow-y-auto ${
          bodyClassName ?? DEFAULT_BODY_CLASS
        } ${belowBottomNav ? "pb-24 sm:pb-0" : ""}`}
      >
        {children}
      </div>

      {footer && (
        <div className={footerClassName ?? DEFAULT_FOOTER_CLASS}>{footer}</div>
      )}
    </>
  );

  return (
    <div className={`${PAGE_OVERLAY_CLASS} ${zIndexClass}`} onClick={handleBackdropClick}>
      {as === "form" ? (
        <form onSubmit={onSubmit} className={cardClassName}>
          {cardContent}
        </form>
      ) : (
        <div className={cardClassName}>{cardContent}</div>
      )}
    </div>
  );
}
