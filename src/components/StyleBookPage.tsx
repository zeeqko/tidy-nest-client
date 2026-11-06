import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { FilterPill } from "./FilterPill";
import { LookCard } from "./LookCard";
import { useLooks } from "../hooks/useLooks";
import { ALL_OCCASIONS, filterLooks, lookCountLabel, occasionFilters } from "../lib/styleBookList";

/** Quiet centred empty block (no icon): Fredoka heading, one muted line, one action. */
function QuietEmpty({ heading, body, action }: { heading: string; body: string; action: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-2 px-6 py-16 text-center">
      <p className="font-heading text-cute-22 font-semibold text-cute-text">{heading}</p>
      <p className="font-body text-cute-13 font-medium text-cute-text-muted">{body}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}

const newLookButtonClass =
  "flex items-center justify-center gap-1.5 rounded-full bg-cute-primary font-body font-bold text-cute-primary-foreground transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cute-primary";

/**
 * Style Book list. Two layouts split at `sm`:
 * - phone: back-button top bar with a "N looks" line, a one-line sideways
 *   scrolling pill row, a 2-column grid of image-only tiles, and a floating
 *   "New look" pill above the bottom nav;
 * - web: a heading row ("Style Book" + count, "New look" on the right), plain
 *   text filters (active = underlined), and an auto-fill grid of tiles whose
 *   name/occasion caption appears on hover or keyboard focus. The web layout uses the
 *   app's page container (centred, symmetric margins); 12.5rem minimum
 *   columns give 3 at 768px, 4 at 1024px, 5 at 1440px and 7 at 1920px.
 * Tapping a tile opens the look's detail page, which owns edit and delete.
 */
export function StyleBookPage() {
  const { looks, loading, error } = useLooks();
  const [activeOccasion, setActiveOccasion] = useState(ALL_OCCASIONS);
  const navigate = useNavigate();
  const pillRowRef = useRef<HTMLDivElement>(null);

  const createLook = () => navigate("/stylebook/create");
  const clearFilter = () => setActiveOccasion(ALL_OCCASIONS);

  const occasions = useMemo(() => occasionFilters(looks), [looks]);
  const filteredLooks = useMemo(() => filterLooks(looks, activeOccasion), [looks, activeOccasion]);

  const loaded = !loading && !error;
  const emptyAll = loaded && looks.length === 0;
  // Reserve the count line's height while loading so nothing jumps.
  const countLabel = loaded ? lookCountLabel(filteredLooks.length) : " ";

  // Keep the selected pill fully visible in the phone's sideways-scrolling
  // row. Scrolls only the row (not the page); a no-op while the row is
  // hidden (web layout: no offsetParent).
  useEffect(() => {
    const row = pillRowRef.current;
    const pill = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !pill || pill.offsetParent !== row) return;
    const pad = 20;
    const left = pill.offsetLeft - pad;
    const right = pill.offsetLeft + pill.offsetWidth + pad;
    if (left < row.scrollLeft) row.scrollTo({ left, behavior: "smooth" });
    else if (right > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: right - row.clientWidth, behavior: "smooth" });
    }
  }, [activeOccasion]);

  return (
    <div className="w-full px-5 pt-2 pb-20 sm:px-12 sm:pt-6 sm:pb-12 lg:px-16">
      <div className="mx-auto flex w-full max-w-cute-page flex-col gap-4 sm:gap-6 2xl:max-w-cute-page-wide">
        <MobileTopBar title="Style Book" subtitle={countLabel} backTo="/" flush />

        <div className="hidden w-full items-center justify-between gap-6 sm:flex">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="font-heading text-cute-30 leading-tight font-semibold text-cute-text">Style Book</h1>
            <p className="font-body text-cute-13 font-medium text-cute-text-muted">{countLabel}</p>
          </div>
          <button type="button" onClick={createLook} className={`${newLookButtonClass} h-[38px] shrink-0 px-5 text-cute-13`}>
            <Plus size={15} strokeWidth={2.5} />
            New look
          </button>
        </div>

        {looks.length > 0 && (
          <>
            {/* Phone: one line of pills, scrolling sideways edge to edge. */}
            <div
              ref={pillRowRef}
              data-testid="occasion-pills"
              role="group"
              aria-label="Filter by occasion"
              className="no-scrollbar relative -mx-5 flex flex-nowrap gap-2 overflow-x-auto px-5 py-1 sm:hidden [&>*]:shrink-0 [&>*]:whitespace-nowrap"
            >
              {occasions.map((occasion) => (
                <FilterPill
                  key={occasion}
                  label={occasion}
                  active={occasion === activeOccasion}
                  pressed={occasion === activeOccasion}
                  onClick={() => setActiveOccasion(occasion)}
                  size="sm"
                />
              ))}
            </div>

            {/* Web: plain text filters; the active one is darker with an underline. */}
            <div
              data-testid="occasion-text-filters"
              role="group"
              aria-label="Filter by occasion"
              className="hidden flex-wrap items-center gap-x-7 gap-y-2 sm:flex">
              {occasions.map((occasion) => {
                const active = occasion === activeOccasion;
                return (
                  <button
                    key={occasion}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActiveOccasion(occasion)}
                    className={`rounded-sm border-b-2 pb-1 font-body text-cute-13 transition outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cute-primary ${
                      active
                        ? "border-cute-primary font-bold text-cute-text"
                        : "border-transparent font-semibold text-cute-text-muted hover:text-cute-text"
                    }`}
                  >
                    {occasion}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {error ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-danger">
            Couldn't load your Style Book from the server: {error}
          </p>
        ) : loading ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">Loading looks…</p>
        ) : emptyAll ? (
          <QuietEmpty
            heading="Nothing here yet"
            body="Build a look from your closet."
            action={
              <button type="button" onClick={createLook} className={`${newLookButtonClass} h-[38px] px-5 text-cute-13`}>
                <Plus size={15} strokeWidth={2.5} />
                New look
              </button>
            }
          />
        ) : filteredLooks.length === 0 ? (
          <QuietEmpty
            heading="No looks for this occasion yet"
            body="Try a different occasion, or clear the filter to see every look."
            action={
              <button
                type="button"
                onClick={clearFilter}
                className="rounded-full border border-cute-border bg-cute-surface px-4 py-2 font-body text-cute-13 font-semibold text-cute-text transition hover:bg-cute-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cute-primary"
              >
                Clear filter
              </button>
            }
          />
        ) : (
          <ul
            aria-label="Looks"
            className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] sm:gap-x-6 sm:gap-y-2"
          >
            {filteredLooks.map((look) => (
              <li key={look.id} className="min-w-0">
                <LookCard look={look} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Phone: floating "New look", clear of the bottom nav (~66px + safe
          area, plus its raised centre button) by ~1rem. The empty state has
          its own button, so it isn't doubled there. */}
      {!emptyAll && (
        <button
          type="button"
          onClick={createLook}
          data-testid="floating-new-look"
          className={`${newLookButtonClass} fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 h-11 -translate-x-1/2 px-6 text-sm shadow-[0_8px_20px_-6px_rgba(74,53,56,0.45)] sm:hidden`}
        >
          <Plus size={16} strokeWidth={2.5} />
          New look
        </button>
      )}
    </div>
  );
}
