import { useMemo, useState } from "react";
import { Plus, Shirt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MobileTopBar } from "./MobileTopBar";
import { FilterPill } from "./FilterPill";
import { LookCard } from "./LookCard";
import { EmptyState } from "./EmptyState";
import { useLooks } from "../hooks/useLooks";
import { seedOccasions } from "../data/occasions";

export function StyleBookPage() {
  const { looks, loading, error } = useLooks();
  const [activeOccasion, setActiveOccasion] = useState("All");
  const navigate = useNavigate();

  const createLook = () => navigate("/stylebook/create");

  const occasions = useMemo(() => {
    const extra = Array.from(
      new Set(
        looks
          .map((look) => look.occasion)
          .filter((occasion): occasion is string => Boolean(occasion) && !seedOccasions.includes(occasion)),
      ),
    );
    return ["All", ...seedOccasions, ...extra];
  }, [looks]);

  const filteredLooks = useMemo(() => {
    if (activeOccasion === "All") return looks;
    return looks.filter((look) => look.occasion === activeOccasion);
  }, [looks, activeOccasion]);

  const clearFilter = () => setActiveOccasion("All");

  return (
    <div className="w-full px-5 pt-2 pb-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4 sm:gap-9">
        <MobileTopBar
          title="Style Book"
          backTo="/"
          action={
            <button
              type="button"
              onClick={createLook}
              aria-label="Create Look"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cute-primary text-cute-primary-foreground transition hover:brightness-105"
            >
              <Plus size={18} />
            </button>
          }
        />
        <div className="hidden sm:block">
          <div className="flex w-full items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="font-heading text-[26px] font-semibold text-cute-text">
                Style Book
              </h1>
              <p className="font-body text-sm text-cute-text-muted">
                {filteredLooks.length} {filteredLooks.length === 1 ? "look" : "looks"} styled from
                your closet
              </p>
            </div>
            <button
              type="button"
              onClick={createLook}
              className="flex items-center gap-1.5 rounded-full bg-cute-primary px-4 py-2.5 font-body text-sm font-medium text-cute-primary-foreground transition hover:brightness-105"
            >
              <Plus size={16} />
              Create Look
            </button>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5">
          {occasions.map((occasion) => (
            <FilterPill
              key={occasion}
              label={occasion}
              active={occasion === activeOccasion}
              onClick={() => setActiveOccasion(occasion)}
              size="sm"
            />
          ))}
        </div>

        {error ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-danger">
            Couldn't load your Style Book from the server: {error}
          </p>
        ) : loading ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            Loading looks…
          </p>
        ) : looks.length === 0 ? (
          <EmptyState
            icon={Shirt}
            heading="Your Style Book is empty"
            body="Build your first outfit from pieces already in your closet."
            action={{ label: "Create Look", onClick: createLook }}
          />
        ) : filteredLooks.length === 0 ? (
          <EmptyState
            icon={Shirt}
            heading="No looks for this occasion yet"
            body="Try a different occasion, or clear the filter to see every look."
            action={{ label: "Clear filter", onClick: clearFilter }}
          />
        ) : (
          <div className="grid w-full grid-cols-2 gap-3 sm:gap-6">
            {filteredLooks.map((look) => (
              <LookCard key={look.id} look={look} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
