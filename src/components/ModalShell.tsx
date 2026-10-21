import { useEffect, useId, useRef } from "react";
import type { FormEvent, MouseEvent, ReactNode, Ref } from "react";
import { ChevronLeft, X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared across every ModalShell instance so nested/stacked modals (e.g. a
 *  form modal opened from a detail modal) only lock body scroll once and
 *  only restore it once the last one closes. */
let openModalCount = 0;
let savedBodyOverflow = "";
/** Open ModalShell instances, oldest first; only the last one (topmost)
 *  reacts to Escape so a confirm over a detail modal doesn't close both. */
const openModalStack: symbol[] = [];
/** Escape events already claimed by the topmost modal. Makes handling
 *  independent of document-listener order: if the upper modal's listener runs
 *  first and unmounts itself, the lower one still sees the event as handled. */
const handledEscapes = new WeakSet<KeyboardEvent>();

const isVisible = (el: HTMLElement) => el.offsetParent !== null || el.getClientRects().length > 0;

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
  "truncate font-heading text-xl font-semibold text-cute-text sm:text-cute-22";

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
  /** When set, the scroll body becomes a focusable labelled region so
   *  keyboard users can scroll it (needed when a footer has other tab stops). */
  bodyLabel?: string;
  /** e.g. `"sm:max-w-[32.5rem]"` — desktop card width (page variant only). */
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
  bodyLabel,
  maxWidthClassName,
  as = "div",
  onSubmit,
  hideMobileBackButton,
  belowBottomNav,
  children,
}: ModalShellPageProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  const setCardRef = (node: HTMLElement | null) => {
    cardRef.current = node;
  };

  // Assumes a child modal mounts in a later commit than its parent (true for
  // every modal today). A parent and child mounting in the same commit would
  // register child-first (effects run children-first) and invert the stack.
  const stackIdRef = useRef<symbol>(Symbol("modal"));
  useEffect(() => {
    const id = stackIdRef.current;
    openModalStack.push(id);
    return () => {
      const index = openModalStack.lastIndexOf(id);
      if (index !== -1) openModalStack.splice(index, 1);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (handledEscapes.has(event)) return;
      if (openModalStack[openModalStack.length - 1] !== stackIdRef.current) return;
      handledEscapes.add(event);
      if (closeGuard && !closeGuard()) return;
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, closeGuard]);

  // Lock background scroll while any modal is open (nested modals share one
  // counter so the outer one's lock survives an inner one closing first).
  useEffect(() => {
    if (openModalCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModalCount += 1;
    return () => {
      openModalCount -= 1;
      // Restore whenever the last open modal goes away, regardless of which
      // one that is (or whether several unmount in the same commit).
      if (openModalCount === 0) document.body.style.overflow = savedBodyOverflow;
    };
  }, []);

  // Trap Tab focus inside the modal card and restore it to whatever had
  // focus before opening, once this modal closes.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const getFocusable = () => Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
    (getFocusable()[0] ?? card).focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Focus on the card itself (or anything not in `items`) would otherwise
      // let Tab/Shift+Tab leave the modal.
      const outside = !active || !items.includes(active);
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    card.addEventListener("keydown", handleKeyDown);
    return () => {
      card.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

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
          ref={setCardRef}
          role="alertdialog"
          aria-modal="true"
          tabIndex={-1}
          className={`flex w-full max-w-[26.25rem] flex-col items-center gap-4 rounded-cute-l bg-cute-surface p-8 text-center outline-none ${CARD_SHADOW}`}
        >
          {children}
        </div>
      </div>
    );
  }

  const cardClassName = `flex h-full w-full flex-col bg-cute-bg sm:h-auto sm:max-h-[90dvh] ${
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
            <h2 id={titleId} className={titleClassName ?? DEFAULT_TITLE_CLASS}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="hidden font-body text-cute-13 text-cute-text-muted sm:block">
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
        {...(bodyLabel ? { tabIndex: 0, role: "region", "aria-label": bodyLabel } : {})}
        className={`flex min-h-0 w-full flex-1 flex-col overflow-y-auto ${
          bodyLabel ? "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cute-primary" : ""
        } ${
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

  const dialogProps = {
    role: "dialog" as const,
    "aria-modal": true,
    "aria-labelledby": titleAs === "h2" ? titleId : undefined,
    tabIndex: -1,
  };

  return (
    <div className={`${PAGE_OVERLAY_CLASS} ${zIndexClass}`} onClick={handleBackdropClick}>
      {as === "form" ? (
        <form
          ref={setCardRef}
          onSubmit={onSubmit}
          className={`${cardClassName} outline-none`}
          {...dialogProps}
        >
          {cardContent}
        </form>
      ) : (
        <div ref={setCardRef} className={`${cardClassName} outline-none`} {...dialogProps}>
          {cardContent}
        </div>
      )}
    </div>
  );
}
