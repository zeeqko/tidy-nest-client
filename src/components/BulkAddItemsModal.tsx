import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import type { ApiCategory } from "../api/categories";
import { commitBulkItem, prepareAndUpload, recognizeAndMatch } from "../lib/bulkAdd";
import { runPool, type PoolHandle } from "../lib/concurrency";
import { BulkAddCard, type BulkCard } from "./BulkAddCard";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { ModalShell } from "./ModalShell";

interface BulkAddItemsModalProps {
  /** Already-loaded categories — this modal does not refetch, mirroring
   *  `ItemFormModal`. */
  apiCategories: ApiCategory[];
  /** Category page the modal was opened from. New cards are pre-seeded with
   *  it only when auto-recognize is OFF at pick time (AI wins when ON). */
  initialCategoryId?: number;
  onClose: () => void;
  /** Called once per commit pass that created at least one item (batch
   *  commit or a single-card retry alike), after that pass fully settles —
   *  never once per created item. */
  onSaved: () => void;
}

const AUTO_RECOGNIZE_KEY = "bulkAdd.autoRecognize";

// Prefix of the note set when recognition suggests a category that is not in
// the list; shared by the setter and the clear-on-category-pick check.
const AI_SUGGESTION_NOTE_PREFIX = "AI suggested ";
const MAX_PHOTOS = 30;
const INGEST_CONCURRENCY = 4;
const COMMIT_CONCURRENCY = 4;

/**
 * Owns the batch: the hidden multi-file input, the card array, the
 * auto-recognize toggle, the ingest pool, the commit pool, and the close
 * guard. Per-card presentation lives in `BulkAddCard`. There are no
 * batch-level value controls: every category (and every other field) is per
 * photo, and a new card starts with no category chosen.
 *
 * Commit: a card is committable once it's `ready` with a non-blank name and a
 * chosen category, or a previously-`error`-from-commit card (retryable,
 * resumable) — see `isCommittable`. Committing runs the committable set
 * through `runPool` at concurrency 4; each card moves `ready -> creating ->
 * done | error` independently. Once the whole pass settles, `done` cards drop
 * out of the grid and, if the pass created at least one item, `onSaved`
 * fires exactly once. The modal closes only if that pass had zero failures;
 * a partial failure keeps it open with a summary and a per-card retry.
 */
export function BulkAddItemsModal({
  apiCategories,
  initialCategoryId,
  onClose,
  onSaved,
}: BulkAddItemsModalProps) {
  const [cards, setCards] = useState<BulkCard[]>([]);
  const [autoRecognize, setAutoRecognize] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(AUTO_RECOGNIZE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  // True while any commit pass (the batch button or a single-card retry) is
  // in flight — drives the disabled state shown to the user. The actual
  // re-entrancy guard is `commitInFlightRef` below, checked synchronously
  // before this state (which updates asynchronously) could possibly reflect
  // in the DOM.
  const [committing, setCommitting] = useState(false);
  // Total items created across every commit pass this modal session, kept
  // even after their cards drop out of the grid — the only way to know "N
  // already committed" once those cards are gone, for the discard-confirm's
  // mixed-state copy.
  const [committedCount, setCommittedCount] = useState(0);

  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Mirrors the `onSavedRef`/`requestCloseRef` pattern below: `runCommitPass`
  // is defined once (a stable `useCallback`) but needs to read the *actual*
  // live `cards` array after `await`ing a pool — the `cards` closure it
  // would otherwise capture is from whenever the callback was last recreated
  // and does not track every render. Kept current by the effect below.
  //
  // Caveat `runCommitPass` relies on: right after `await`ing its own pool,
  // this ref is *not* guaranteed to yet reflect that same pool's very last
  // `onSettle`-driven `setCards` call (the two are both microtask-scheduled,
  // with no ordering guarantee that the state update's render/effect flushes
  // before the `await` continuation runs) — confirmed empirically, not just
  // theoretically. `runCommitPass` therefore only reads this ref for cards
  // *outside* the pass it just ran, and gets that pass's own outcomes
  // directly from the pool's resolved `results` instead. See the comment
  // there for the full reasoning.
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Read via a ref (mirrors ItemFormModal's onCloseRef pattern) so
  // `runCommitPass` — defined once, called from multiple stable callbacks —
  // always calls the latest `onSaved` without needing to be in its
  // dependency array.
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // Revoke every object URL this modal ever created, on unmount. Removal
  // revokes its own URL immediately (see removeCard) and deletes it here too
  // so it isn't double-revoked. The cleanup below reads `.current` directly
  // rather than copying it into a local variable during setup — either
  // style is equivalent here, since `.current` is one stable `Set` object
  // created once via `useRef(new Set())` and only ever mutated in place
  // (never reassigned), so both see every URL added between mount and
  // unmount. The exhaustive-deps rule below is calibrated for refs that get
  // *reassigned* (e.g. a DOM-node ref across remounts); that hazard doesn't
  // apply to a stable mutable container like this one.
  const previewUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current.clear();
    };
  }, []);

  // Idempotent open-picker bookkeeping (settled decision 4 of "full-parity
  // item fields in the bulk-add review grid"). Keyed by `${cardId}:${field}`
  // rather than counted, because `OptionPicker.onOpenChange` fires from an
  // effect with `[open, onOpenChange]` deps and can re-fire the same open/
  // close state on a re-render — a counter would drift, a Set add/delete
  // does not. A plain ref (not state) is enough: `closeGuard` below only
  // needs to read the *current* value on demand (Escape/backdrop-click),
  // never to trigger a re-render when it changes.
  const openPickersRef = useRef<Set<string>>(new Set());
  const handlePickerOpenChange = useCallback((cardId: string, field: string, open: boolean) => {
    const key = `${cardId}:${field}`;
    if (open) openPickersRef.current.add(key);
    else openPickersRef.current.delete(key);
  }, []);
  // Mirrors ItemFormModal's own closeGuard: Escape/backdrop close only when
  // no card's OptionPicker is currently open, so the first Escape closes
  // just the picker (OptionPicker's own effect handles that) and only a
  // second, picker-free Escape reaches the discard-confirm gate below.
  const closeGuard = useCallback(() => openPickersRef.current.size === 0, []);
  // Batch-generation stale guard (decision 10) — same shape as
  // ItemFormModal's `recognitionRequestIdRef`, bumped once this modal is
  // gone so a late-settling ingest promise (in-flight fetches are never
  // aborted — no AbortSignal available on the shared API modules) drops its
  // result instead of applying it to state that's about to disappear.
  const batchGenerationRef = useRef(0);
  // Every pool started (ingest or commit) so closing can stop each from
  // *scheduling* further tasks (already-started ones are left to settle on
  // their own). Typed by the one member every pool handle shares — the
  // ingest and commit pools carry different result types, and nothing here
  // reads `.result` off this array, only `.stop()`.
  const activePoolsRef = useRef<Array<Pick<PoolHandle<unknown>, "stop">>>([]);

  // The real non-reentrancy guard for commit (T4's own "Done when": pressing
  // commit twice in rapid succession must create each item exactly once).
  // Set synchronously as the very first thing `runCommitPass` does, before
  // any `await` — a second call (whether from a second click on the same
  // button, or a click on a different card's retry while the first pass is
  // still running) sees this already `true` and bails immediately, before
  // touching `setCards`/`commitBulkItem` at all. `committing` state exists
  // only to reflect this in the UI (disabling buttons); it is not itself the
  // guard, since React state updates aren't guaranteed to land before a
  // second synchronous click handler runs.
  const commitInFlightRef = useRef(false);

  // Runs on *every* close path — confirmed discard, and the silent close
  // when nothing was worth confirming (e.g. closing right after picking a
  // batch, while every card is still `uploading` and untouched) — because
  // both ultimately unmount this component. Scoping this to an unmount
  // effect instead of duplicating it into each close handler means no
  // future close path can forget to stop the pool/bump the generation.
  // Reads `activePoolsRef.current` directly for the same reason noted above
  // `previewUrlsRef`: it's one stable array, only ever mutated via `.push`,
  // never reassigned, so reading it at cleanup time vs. copying it into a
  // local variable during setup behave identically here.
  useEffect(() => {
    return () => {
      batchGenerationRef.current += 1;
      for (const pool of activePoolsRef.current) pool.stop();
    };
  }, []);

  const ingestOne = useCallback(
    async (id: string, file: File, autoRecognizeEnabled: boolean, generation: number) => {
      const apply = (updater: (c: BulkCard) => BulkCard) => {
        if (batchGenerationRef.current !== generation) return;
        setCards((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
      };

      const uploadResult = await prepareAndUpload(file);
      if (!uploadResult.ok) {
        apply((c) => ({
          ...c,
          stage: "error",
          error: uploadResult.message,
          retryable: uploadResult.retryable,
        }));
        return;
      }
      apply((c) => ({ ...c, imageURL: uploadResult.imageURL }));

      if (!autoRecognizeEnabled) {
        apply((c) => ({ ...c, stage: "ready" }));
        return;
      }

      apply((c) => ({ ...c, stage: "recognizing" }));
      const recognizeResult = await recognizeAndMatch(
        uploadResult.preparedBlob,
        uploadResult.preparedFilename,
        apiCategories,
      );
      if (!recognizeResult.ok) {
        // Recognition is optional — a failure here is not an `error` card,
        // it's a `ready` card with an empty name and an advisory note.
        apply((c) => ({ ...c, stage: "ready", note: recognizeResult.message }));
        return;
      }
      if (recognizeResult.match.matched) {
        const matchedId = recognizeResult.match.categoryId;
        apply((c) => ({
          ...c,
          stage: "ready",
          // Keep a name the user typed while recognizing.
          name: c.name.trim() !== "" ? c.name : recognizeResult.name,
          note: null,
          aiPickedCategory: !c.categoryTouchedByUser,
          // Never clobber a category the user already picked for this card
          // while it was still recognizing.
          categoryId: c.categoryTouchedByUser ? c.categoryId : matchedId,
          // Fields aren't disabled during `recognizing`, so a user can pick a
          // subcategory meanwhile. Clear it only when the category actually
          // moves, since the stale name would belong to the wrong category.
          subcategory:
            c.categoryTouchedByUser || matchedId === c.categoryId ? c.subcategory : "",
        }));
      } else {
        // Unmatched: the category stays unset and the user picks one.
        const suggested = recognizeResult.match.suggestedCategory;
        apply((c) => ({
          ...c,
          stage: "ready",
          name: c.name.trim() !== "" ? c.name : recognizeResult.name,
          // `c` is the latest state: skip the hint if a category was set
          // while recognizing.
          note: c.categoryId === null ? `${AI_SUGGESTION_NOTE_PREFIX}"${suggested}" — choose a category` : null,
        }));
      }
    },
    [apiCategories],
  );

  const runIngestForCards = useCallback(
    (newCards: BulkCard[]) => {
      const generation = batchGenerationRef.current;
      const autoRecognizeAtPick = autoRecognize;
      const tasks = newCards.map(
        (card) => () => ingestOne(card.id, card.file, autoRecognizeAtPick, generation),
      );
      const pool = runPool(tasks, { concurrency: INGEST_CONCURRENCY });
      activePoolsRef.current.push(pool);
    },
    [autoRecognize, ingestOne],
  );

  // Decision 7: `ready` with a non-blank name. Extended, per this ticket's
  // resumability requirement, to also cover a card that already failed
  // *commit* (not ingest) — `stage === "error"` with `imageURL` set — so
  // pressing the batch commit button again resends those alongside any
  // newly-`ready` cards, without the user having to hunt down each one's own
  // retry. A card also needs a chosen category (every category is per photo and
  // starts unset).
  const isCommittable = useCallback(
    (c: BulkCard) =>
      c.name.trim() !== "" &&
      c.categoryId !== null &&
      (c.stage === "ready" || (c.stage === "error" && c.imageURL !== null)),
    [],
  );

  // Runs `toCommit` through T1's pool at concurrency 4, calling T2's
  // `commitBulkItem` for each. Shared by both the batch "Add N Items" button
  // and a single commit-stage card's own Retry button (a one-card pass is
  // just a pool of one) — see the module docstring above for the full
  // contract (non-reentrant, `onSaved` once per pass, close-on-full-success).
  const runCommitPass = useCallback(
    async (toCommit: BulkCard[]) => {
      if (toCommit.length === 0 || commitInFlightRef.current) return;
      commitInFlightRef.current = true;
      setCommitting(true);

      const generation = batchGenerationRef.current;
      const idsThisPass = new Set(toCommit.map((c) => c.id));
      const categoryNameFor = (categoryId: number | null) =>
        apiCategories.find((c) => c.id === categoryId)?.name ?? "";

      setCards((prev) =>
        prev.map((c) => (idsThisPass.has(c.id) ? { ...c, stage: "creating", error: null } : c)),
      );

      // `index` (not a round-tripped id) is what maps a settle event back to
      // its card, since `runPool` guarantees `index` matches `toCommit`'s
      // input order regardless of completion order.
      const tasks = toCommit.map((card) => () =>
        commitBulkItem({
          name: card.name.trim(),
          category: categoryNameFor(card.categoryId),
          imageURL: card.imageURL ?? "",
          // T1's commitBulkItem trims/clamps/converts every one of these —
          // this call site passes raw card state, never re-normalizing it
          // itself (mirrors the module's own "normalize once, centrally"
          // contract). This holds for T3's tier-2 fields too: quantity is
          // sent as-is (a string), tags as plain names, notes/dates
          // untouched — none of it is trimmed/clamped/shape-converted here.
          subcategory: card.subcategory,
          location: card.location,
          quantity: card.quantity,
          tags: card.tags,
          notes: card.notes,
          opensOn: card.opensOn,
          expiryDate: card.expiryDate,
        }),
      );

      const pool = runPool(tasks, {
        concurrency: COMMIT_CONCURRENCY,
        // Per-card live update as each settles, independent of the others —
        // this is what lets the grid show a genuine mid-pass mix of
        // creating/done/error cards rather than jumping straight to the
        // end-of-pass state.
        onSettle: ({ index, result: taskResult }) => {
          if (batchGenerationRef.current !== generation) return;
          const id = toCommit[index].id;
          if (!taskResult.ok) {
            // Defensive: `commitBulkItem` never rejects, so this task should
            // never actually throw — but if it somehow did, surface an
            // error rather than stranding the card in `creating` forever.
            setCards((prev) =>
              prev.map((c) =>
                c.id === id
                  ? { ...c, stage: "error", error: "Couldn't add this item — try again.", retryable: true }
                  : c,
              ),
            );
            return;
          }
          const stageResult = taskResult.value;
          setCards((prev) =>
            prev.map((c) =>
              c.id === id
                ? stageResult.ok
                  ? { ...c, stage: "done" }
                  : {
                      ...c,
                      stage: "error",
                      error: stageResult.message,
                      retryable: stageResult.retryable,
                    }
                : c,
            ),
          );
        },
      });
      activePoolsRef.current.push(pool);

      const results = await pool.result;

      // The modal was closed/discarded mid-pass — don't touch state that's
      // about to disappear, and don't fire onSaved/onClose for a pass whose
      // outcome no longer matters to anything on screen.
      if (batchGenerationRef.current !== generation) return;

      let createdCount = 0;
      let failedCount = 0;
      for (const entry of results) {
        // `entry` is `undefined` only if the pool was stopped before this
        // task started, which never happens here (nothing calls `.stop()`
        // on a commit pool except the unmount effect, which also bumps the
        // generation checked above).
        if (!entry) continue;
        if (entry.ok && entry.value.ok) createdCount += 1;
        else failedCount += 1;
      }

      // `toCommit` is only ever a subset of `cards`: other cards can be
      // sitting in `uploading`/`recognizing` (commit is pressable while
      // ingest is still running), can have turned `ready` mid-pass (the
      // ingest and commit pools run concurrently, nothing serializes them),
      // or can simply be unrelated cards during a single-card retry
      // (`retryCard` -> `runCommitPass([card])`). The close decision below
      // needs the real, full picture of the grid, not just `toCommit`'s own
      // `failedCount`, so those other cards are never silently dropped
      // alongside a fully-successful pass.
      //
      // Deliberately *not* just `cardsRef.current.filter(stage !== "done")`:
      // `cardsRef` is kept current by an effect, which only runs once React
      // actually commits a render — and empirically, immediately after
      // `await pool.result` resolves, the *last* task's own `onSettle` state
      // update has not necessarily reached that effect yet (its `setCards`
      // call and this `await`'s continuation are both microtask-scheduled,
      // with no guarantee the former's render/effect flushes before the
      // latter runs). So for cards `toCommit` itself just committed, this
      // reads their outcome straight from `results` — the pool's own
      // resolved data, not a React state read — which has no such race.
      // `cardsRef.current` is only used for cards this pass never touched,
      // where that race doesn't apply.
      const untouchedByThisPass = cardsRef.current.filter(
        (c) => !idsThisPass.has(c.id) && c.stage !== "done",
      );
      const failedThisPass = toCommit.filter((_, index) => {
        const entry = results[index];
        return !entry || !entry.ok || !entry.value.ok;
      });
      const remainingAfter = [...untouchedByThisPass, ...failedThisPass];

      // Settled decision 6: done cards drop out of the grid once the whole
      // pass (not each individual card) has settled.
      setCards((prev) => prev.filter((c) => c.stage !== "done"));
      setCommittedCount((prev) => prev + createdCount);

      commitInFlightRef.current = false;
      setCommitting(false);

      // Fires once per pass that created at least one item — never per
      // item, and never for a pass that created nothing (e.g. a failed
      // single-card retry).
      if (createdCount > 0) onSavedRef.current();

      // Never close on a partial success, and never close out from under
      // cards this pass didn't even touch — only when this pass had zero
      // failures *and* nothing at all is left in the grid (nothing mid-ingest,
      // nothing blocked on a blank name, no other error card sitting around).
      if (failedCount === 0 && remainingAfter.length === 0) onClose();
    },
    [apiCategories, onClose],
  );

  const handleFilesPicked = (fileList: FileList) => {
    const incoming = Array.from(fileList);
    const capacity = Math.max(0, MAX_PHOTOS - cards.length);
    const accepted = incoming.slice(0, capacity);
    if (accepted.length === 0 && incoming.length > 0) {
      // The batch was already at the cap before this pick — nothing new to
      // count, so name the limit itself rather than "kept 0 of N".
      setCapMessage(
        `This batch is already at the ${MAX_PHOTOS}-photo limit — commit these and start another batch.`,
      );
    } else if (incoming.length > accepted.length) {
      // Reflects how many of *this* pick were actually accepted, not the
      // batch cap itself — matters once cards already exist (e.g. picking
      // 10 more with 28 already in the batch only accepts 2).
      setCapMessage(
        `Kept the first ${accepted.length} of ${incoming.length} photos — commit these and start another batch.`,
      );
    } else {
      // A later pick that fit within the remaining room shouldn't leave a
      // stale cap message from an earlier, capped pick on screen.
      setCapMessage(null);
    }
    if (accepted.length === 0) return;

    // Pre-seed the page's category only when auto-recognize is OFF at pick
    // time and that category is actually loaded; ON never falls back to it.
    const seedCategoryId =
      !autoRecognize &&
      initialCategoryId !== undefined &&
      apiCategories.some((c) => c.id === initialCategoryId)
        ? initialCategoryId
        : null;
    const newCards: BulkCard[] = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        stage: "uploading",
        name: "",
        // Every category is per photo: a new card starts with none chosen.
        categoryId: seedCategoryId,
        categoryTouchedByUser: false,
        aiPickedCategory: false,
        subcategory: "",
        location: "",
        quantity: "1",
        tags: [],
        opensOn: "",
        expiryDate: "",
        notes: "",
        // Collapsed on every card regardless of category (decision 1's
        // deliberate divergence from ItemFormModal's remindsByDefault
        // auto-open) — never derived from `apiCategories`/reminderOnExpiry.
        detailsOpen: false,
        note: null,
        error: null,
        retryable: false,
        imageURL: null,
      };
    });
    setCards((prev) => [...prev, ...newCards]);
    runIngestForCards(newCards);
  };

  // Every handler below that is passed straight through to `BulkAddCard` is
  // wrapped in `useCallback` with a *stable* identity (decision 5 of
  // "full-parity item fields in the bulk-add review grid" — typing into one
  // card must not re-render the other 29). None of them close over `cards`
  // directly: they either use the `setCards` updater form (which never
  // needs `cards` as a dependency) or, where a handler needs to read a
  // card's current value synchronously (retryCard), they read `cardsRef`
  // instead — the same ref `runCommitPass` already relies on to see the
  // latest array without depending on `cards` itself.
  const removeCard = useCallback((id: string) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (card) {
        URL.revokeObjectURL(card.previewUrl);
        previewUrlsRef.current.delete(card.previewUrl);
      }
      return prev.filter((c) => c.id !== id);
    });
    // Drop any open-picker bookkeeping for a card that no longer exists —
    // harmless to leave (closeGuard only cares whether the set is empty),
    // but tidy rather than leaking keys for the modal's lifetime.
    for (const key of openPickersRef.current) {
      if (key.startsWith(`${id}:`)) openPickersRef.current.delete(key);
    }
  }, []);

  const retryCard = useCallback(
    (id: string) => {
      const card = cardsRef.current.find((c) => c.id === id);
      if (!card) return;
      if (card.stage === "error" && card.imageURL !== null) {
        // A commit-stage failure — recommit just this card (a one-card
        // `runCommitPass`), not a re-ingest. Guarded by `commitInFlightRef`
        // like every other entry into `runCommitPass`, so this silently
        // no-ops if a batch pass happens to be in flight already (the
        // button is also disabled in that case — see `committing` passed to
        // `BulkAddCard`). If the user cleared the name while this card was
        // sitting in error, it's no longer committable (decision 7) — the
        // "Name required" marker is already showing; don't waste a request
        // on a payload the backend would reject anyway. Filling the name
        // back in makes it eligible again via this same button or the batch
        // commit button.
        if (card.name.trim() === "") return;
        void runCommitPass([card]);
        return;
      }
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, stage: "uploading", error: null, retryable: false } : c,
        ),
      );
      void ingestOne(id, card.file, autoRecognize, batchGenerationRef.current);
    },
    [autoRecognize, ingestOne, runCommitPass],
  );

  // A stale 30-photo cap message goes away once there is room again.
  useEffect(() => {
    if (cards.length < MAX_PHOTOS) setCapMessage(null);
  }, [cards.length]);

  const handleNameChange = useCallback((id: string, name: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, []);

  const handleCategoryChange = useCallback((id: string, categoryId: number) => {
    // Settled decision 9: changing a card's own category clears that card's
    // own subcategory (the picker's options/placeholder are about to change
    // out from under it) — unconditionally, exactly as ItemFormModal does.
    // `categoryTouchedByUser` stops a late AI match from overwriting this pick.
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              categoryId,
              categoryTouchedByUser: true,
              aiPickedCategory: false,
              subcategory: "",
              // Picking a category resolves both the AI hint and a
              // recognition-failure note, so neither goes stale.
              note: null,
            }
          : c,
      ),
    );
  }, []);

  const handleSubcategoryChange = useCallback((id: string, subcategory: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, subcategory } : c)));
  }, []);

  const handleLocationChange = useCallback((id: string, location: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, location } : c)));
  }, []);

  // T3's tier-2 field handlers — same "stable useCallback, updater form, no
  // `cards` closure" shape as every tier-1 handler above (decision 5).
  const handleQuantityChange = useCallback((id: string, quantity: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, quantity } : c)));
  }, []);

  // Toggles `name` in/out of the card's tag list — shared by the Tags
  // picker's onSelect and a chip's own remove button.
  const handleTagsChange = useCallback((id: string, name: string) => {
    setCards((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              tags: c.tags.includes(name)
                ? c.tags.filter((t) => t !== name)
                : [...c.tags, name],
            }
          : c,
      ),
    );
  }, []);

  const handleOpensOnChange = useCallback((id: string, opensOn: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, opensOn } : c)));
  }, []);

  const handleExpiryDateChange = useCallback((id: string, expiryDate: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, expiryDate } : c)));
  }, []);

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, notes } : c)));
  }, []);

  // Flips just this card's `detailsOpen`. Nothing else writes to it, so a
  // later category change or a recognition match never clobbers it.
  const handleToggleDetails = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, detailsOpen: !c.detailsOpen } : c)),
    );
  }, []);

  // Decision 3: any card past `uploading`, or carrying a user edit (typed
  // name / manually picked category), needs a confirm before discarding. An
  // untouched, empty (or all-still-uploading) modal closes silently.
  const hasUnsavedProgress = cards.some(
    (c) => c.stage !== "uploading" || c.name.trim() !== "" || c.categoryTouchedByUser,
  );

  const requestClose = useCallback(() => {
    if (hasUnsavedProgress) {
      setDiscardConfirmOpen(true);
    } else {
      onClose();
    }
  }, [hasUnsavedProgress, onClose]);

  const confirmDiscard = () => {
    // Stopping the pool / bumping the generation happens in the unmount
    // effect above, which fires once `onClose()` below actually unmounts
    // this component — no need to duplicate that here.
    setDiscardConfirmOpen(false);
    onClose();
  };

  // History-guard bookkeeping, copied from ItemFormModal's pattern (not
  // extracted into a shared hook — settled decision 1 forbids touching
  // ItemFormModal, and PLAN.md's Deferred section calls out the extraction
  // as a follow-up). Refs (not effect-local variables) so they survive React
  // StrictMode's dev-only synchronous mount->cleanup->mount without
  // double-pushing history or self-closing the modal.
  const historyPushedRef = useRef(false);
  const componentMountedRef = useRef(false);
  const poppedByBrowserRef = useRef(false);
  const restoreGuardRef = useRef<() => void>(() => {});

  // Latest requestClose, read from the mount-once effect below without
  // making that effect depend on it — mirrors ItemFormModal's onCloseRef,
  // but routes browser Back through the same discard-confirm gate as every
  // other close path (X, Escape, backdrop) instead of closing directly.
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  }, [requestClose]);

  useEffect(() => {
    componentMountedRef.current = true;
    if (!historyPushedRef.current) {
      window.history.pushState({ bulkAddItemsModal: true }, "");
      historyPushedRef.current = true;
    }
    const handlePopState = () => {
      poppedByBrowserRef.current = true;
      requestCloseRef.current();
    };
    // Cancelling a Back-triggered discard prompt: the guard entry was already
    // consumed by the pop, so put it back (else a second Back leaves silently).
    restoreGuardRef.current = () => {
      if (!poppedByBrowserRef.current) return;
      poppedByBrowserRef.current = false;
      window.history.pushState({ bulkAddItemsModal: true }, "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      componentMountedRef.current = false;
      window.removeEventListener("popstate", handlePopState);
      if (poppedByBrowserRef.current) return;
      setTimeout(() => {
        if (!componentMountedRef.current && historyPushedRef.current) {
          historyPushedRef.current = false;
          window.history.back();
        }
      }, 0);
    };
  }, []);

  // Warn before a reload/tab close throws away unsaved progress.
  useEffect(() => {
    if (!hasUnsavedProgress) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedProgress]);

  // The live committable count — drives both the "X of Y ready to add"
  // summary and the commit button's own label, so the two numbers can never
  // disagree. Deliberately broader than "ready with a name" alone: it also
  // counts resumable commit-error cards (see `isCommittable`'s docstring),
  // since after a partial failure the button's count and this summary must
  // describe the same thing a press of Commit is about to act on.
  const committableCount = cards.filter(isCommittable).length;
  // Cards currently sitting in a commit-stage error, i.e. failures from the
  // most recent pass(es) that haven't been retried away yet — combined with
  // `committedCount` for the partial-failure summary. Never non-zero at the
  // same time the modal is mid-close, since a pass with zero failures closes
  // the modal itself (see `runCommitPass`).
  const commitFailedCount = cards.filter((c) => c.stage === "error" && c.imageURL !== null).length;
  // Footer status breakdown. A card that is `ready` (or a resumable commit
  // error) but missing both a name and a category counts in both groups.
  const isReviewable = (c: BulkCard) =>
    c.stage === "ready" || (c.stage === "error" && c.imageURL !== null);
  const needCategoryCount = cards.filter((c) => isReviewable(c) && c.categoryId === null).length;
  const needNameCount = cards.filter((c) => isReviewable(c) && c.name.trim() === "").length;
  const uploadFailedCount = cards.filter((c) => c.stage === "error" && c.imageURL === null).length;
  const processingCount = cards.filter(
    (c) => c.stage === "uploading" || c.stage === "recognizing",
  ).length;

  return (
    <>
      <ModalShell
        level="elevated"
        onClose={requestClose}
        closeGuard={closeGuard}
        maxWidthClassName="sm:max-w-[640px]"
        title="Add Multiple Photos"
        footer={
          cards.length > 0 ? (
            <div className="flex w-full flex-col items-center gap-2.5">
              <p className="w-full text-center font-body text-sm font-semibold text-cute-text">
                {[
                  `${committableCount} of ${cards.length} ready`,
                  needCategoryCount > 0 && `· ${needCategoryCount} need a category`,
                  needNameCount > 0 && `· ${needNameCount} need a name`,
                  processingCount > 0 && `· ${processingCount} processing`,
                  uploadFailedCount > 0 && `· ${uploadFailedCount} failed to upload`,
                ]
                  .filter((s): s is string => typeof s === "string")
                  .map((segment, i) => (
                    <Fragment key={i}>
                      {i > 0 && " "}
                      <span className="inline-block whitespace-nowrap">{segment}</span>
                    </Fragment>
                  ))}
              </p>
              {commitFailedCount > 0 && (
                <p className="w-full text-center font-body text-xs font-semibold text-cute-danger">
                  {committedCount} added, {commitFailedCount} failed
                </p>
              )}
              <button
                type="button"
                onClick={() => void runCommitPass(cards.filter(isCommittable))}
                disabled={committing || committableCount === 0}
                className="flex w-full items-center justify-center rounded-full bg-cute-primary px-4 py-3 font-body text-sm font-semibold text-cute-primary-foreground transition hover:brightness-105 disabled:opacity-60"
              >
                {committing
                  ? "Adding…"
                  : committableCount === 0
                    ? "Nothing to add yet"
                    : `Add ${committableCount} Item${committableCount === 1 ? "" : "s"}`}
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={autoRecognize}
            onClick={() => {
              const next = !autoRecognize;
              setAutoRecognize(next);
              try {
                window.localStorage.setItem(AUTO_RECOGNIZE_KEY, next ? "1" : "0");
              } catch {
                // Persistence is best-effort.
              }
            }}
            className={`flex items-center gap-1.5 rounded-full border-[1.5px] px-2.5 py-1.5 font-body text-xs font-semibold transition ${
              autoRecognize
                ? "border-cute-primary bg-cute-primary/10 text-cute-primary"
                : "border-cute-border bg-cute-surface text-cute-text-muted"
            }`}
          >
            <Sparkles size={12} />
            Auto-recognize
            <span
              className={`flex h-4 w-7 items-center rounded-full p-0.5 transition ${
                autoRecognize ? "justify-end bg-cute-primary" : "justify-start bg-cute-border"
              }`}
            >
              <span className="h-3 w-3 rounded-full bg-cute-surface shadow" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            className="flex items-center gap-1 rounded-full bg-cute-surface-alt px-3 py-1.5 font-body text-xs font-semibold text-cute-text transition hover:brightness-95"
          >
            <Plus size={14} />
            Add photos
          </button>
        </div>
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            // `e.target.files` is a *live* FileList — clearing `.value`
            // empties it in place, so it must be read (and handed off) before
            // the reset below, not after (matches ItemFormModal's
            // handlePhotoChange, which reads `files?.[0]` before resetting).
            const files = e.target.files;
            if (files && files.length > 0) handleFilesPicked(files);
            e.target.value = "";
          }}
        />

        {capMessage && (
          <p className="font-body text-xs font-semibold text-cute-primary">{capMessage}</p>
        )}

        {cards.length === 0 ? (
          <p className="w-full py-10 text-center font-body text-sm text-cute-text-muted">
            No photos yet — choose some to get started.
          </p>
        ) : (
          // Single column at every width: compact per-photo rows (the
          // expandable Details live inside each card).
          <div className="flex w-full flex-col gap-2.5">
            {cards.map((card) => (
              <BulkAddCard
                key={card.id}
                card={card}
                apiCategories={apiCategories}
                onNameChange={handleNameChange}
                onCategoryChange={handleCategoryChange}
                onSubcategoryChange={handleSubcategoryChange}
                onLocationChange={handleLocationChange}
                onQuantityChange={handleQuantityChange}
                onTagsChange={handleTagsChange}
                onOpensOnChange={handleOpensOnChange}
                onExpiryDateChange={handleExpiryDateChange}
                onNotesChange={handleNotesChange}
                onToggleDetails={handleToggleDetails}
                onPickerOpenChange={handlePickerOpenChange}
                onRetry={retryCard}
                onRemove={removeCard}
                committing={committing}
              />
            ))}
          </div>
        )}
      </ModalShell>

      {discardConfirmOpen && (
        <ConfirmDeleteModal
          title={committedCount > 0 ? "Discard the rest of this batch?" : "Discard this batch?"}
          message={
            committedCount > 0
              ? // Mixed state: some cards from an earlier commit pass already
                // created real items, which discarding the rest can't undo —
                // say so explicitly rather than reusing the pre-commit
                // "discard batch" copy, which would otherwise wrongly imply
                // nothing has happened yet.
                `${committedCount} item${committedCount === 1 ? "" : "s"} from this batch ${committedCount === 1 ? "was" : "were"} already added and won't be undone. This discards the remaining ${cards.length} photo${cards.length === 1 ? "" : "s"} and any names or categories you've entered.`
              : `This removes ${cards.length} photo${cards.length === 1 ? "" : "s"} and any names or categories you've entered. This can't be undone.`
          }
          confirmLabel="Discard"
          onCancel={() => {
            setDiscardConfirmOpen(false);
            restoreGuardRef.current();
          }}
          onConfirm={confirmDiscard}
        />
      )}

    </>
  );
}
