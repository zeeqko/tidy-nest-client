// Headless per-photo pipeline for "bulk add items from a multi-photo
// selection" (PLAN.md T2). Three independent stages — prepare+upload,
// recognize+match, commit — each takes one photo/card's worth of input and
// resolves a discriminated result. Like `concurrency.ts` and
// `itemCutout.ts`, every stage here must never throw and never reject: a
// network failure, a bad response, or an unexpected error all resolve to a
// `{ ok: false, ... }` result instead of propagating, so callers (the
// bulk-add UI's per-card state machine, built in a later ticket) never need
// a try/catch around these calls.
//
// No React, no state machine, no timers, no DOM — this is the network/data
// layer only. `uploadImage`, `recognizeItem`, and `createItem` are used
// exactly as they exist today and are never modified here.
//
// This module owns all error-message normalization. `uploadImage` and
// `recognizeItem` (and `createItem`, via `request()`) already surface the
// backend's `{error}` JSON response body as `Error.message`, so those
// messages are reused directly where available; callers should never need
// to parse a server error themselves.
//
// `retryable` on every failure distinguishes "retryable as-is" (network
// failures and 5xx responses — a later attempt might succeed) from
// "retrying will fail identically" (a known permanent 4xx failure, e.g. an
// unsupported file type or a file over the server's size cap). None of
// `uploadImage`, `recognizeItem`, or `request()` (used by `createItem`)
// expose the HTTP status code on the thrown Error — only its message — so
// this is determined by matching the small, fixed set of message strings
// the backend is known to return for its permanent-failure cases (see
// `PERMANENT_FAILURE_MESSAGES` below). Anything else, including a network
// error with no HTTP response at all and any other message this module
// doesn't recognize, defaults to `retryable: true`, the safer default for
// an unrecognized failure.

import { preparePhoto } from "./image";
import { uploadImage } from "../api/uploads";
import { recognizeItem } from "../api/recognition";
import { createItem, type ApiInventoryItem, type NewInventoryItem } from "../api/inventory";
import type { ApiCategory } from "../api/categories";

/** A normalized, user-facing failure from any of this module's three stages. */
export interface StageFailure {
  ok: false;
  /** Server- or client-derived message, safe to show directly to the user. */
  message: string;
  /**
   * True if a later attempt with the same input might succeed (network
   * error, 5xx). False if the same input will fail the same way again
   * (unsupported file type, oversized file, no categories to classify
   * into) — see the module docstring for how this is determined.
   */
  retryable: boolean;
}

// The exact set of messages the backend is known to return for a failure
// that will recur on retry with the same input (upload_controller.go and
// recognition_controller.go). Everything else defaults to retryable=true.
const PERMANENT_FAILURE_MESSAGES = new Set<string>([
  // Covers both a genuinely missing multipart field and an oversized file:
  // http.MaxBytesReader makes the multipart body read fail before the
  // controller can tell the two apart, so both are reported this way.
  "missing image file",
  "unsupported image type",
  "no categories to classify into — add a category first",
]);

function toFailure(err: unknown, fallbackMessage: string): StageFailure {
  const message = err instanceof Error && err.message ? err.message : fallbackMessage;
  return { ok: false, message, retryable: !PERMANENT_FAILURE_MESSAGES.has(message) };
}

// ---------------------------------------------------------------------------
// Stage 1: prepare + upload
// ---------------------------------------------------------------------------

/**
 * Success result of `prepareAndUpload`: the uploaded URL, plus the exact
 * prepared blob/filename `preparePhoto` produced, so `recognizeAndMatch`
 * (stage 2) can reuse it without preparing the photo a second time —
 * decision 9 of the bulk-add plan.
 */
export interface UploadSuccess {
  ok: true;
  imageURL: string;
  preparedBlob: Blob;
  preparedFilename: string;
}

export type UploadStageResult = UploadSuccess | StageFailure;

/**
 * Stage 1: downscales `photo` once via `preparePhoto`, then uploads the
 * resulting blob via `uploadImage`. Never throws/rejects.
 */
export async function prepareAndUpload(photo: File): Promise<UploadStageResult> {
  try {
    const { blob, filename } = await preparePhoto(photo);
    const uploaded = await uploadImage(blob, filename);
    return { ok: true, imageURL: uploaded.url, preparedBlob: blob, preparedFilename: filename };
  } catch (err) {
    return toFailure(err, "Couldn't upload this photo — try again.");
  }
}

// ---------------------------------------------------------------------------
// Stage 2: recognize + match
// ---------------------------------------------------------------------------

/** Either the recognized category matched one of the caller's categories, or
 * it didn't and the raw suggested category name is carried for an advisory
 * note (decision 8 — the card's category stays unset until the user picks
 * one; this is not treated as a failure). */
export type CategoryMatch =
  | { matched: true; categoryId: number }
  | { matched: false; suggestedCategory: string };

export interface RecognizeSuccess {
  ok: true;
  name: string;
  match: CategoryMatch;
}

export type RecognizeStageResult = RecognizeSuccess | StageFailure;

/**
 * Stage 2: sends the already-prepared blob/filename from stage 1 (never the
 * original photo — decision 9) to `/api/recognize`, then matches the
 * returned category name against `categories` case-insensitively, exactly
 * as `ItemFormModal.runRecognition` does today.
 *
 * All four of `/api/recognize`'s failure modes — 503 (no API key
 * configured), 502 (Gemini failed), 422 (caller has no categories), 400
 * (unsupported/oversized image) — collapse into the same `StageFailure`
 * shape here, so the caller shows one "couldn't recognize — fill this in
 * yourself" outcome regardless of which one occurred; the server's own
 * message (where available) rides along in `.message`.
 */
export async function recognizeAndMatch(
  preparedBlob: Blob,
  preparedFilename: string,
  categories: readonly ApiCategory[],
): Promise<RecognizeStageResult> {
  try {
    const result = await recognizeItem(preparedBlob, preparedFilename);
    const match = categories.find(
      (category) => category.name.toLowerCase() === result.category.toLowerCase(),
    );
    return {
      ok: true,
      name: result.itemName,
      match: match
        ? { matched: true, categoryId: match.id }
        : { matched: false, suggestedCategory: result.category },
    };
  } catch (err) {
    return toFailure(err, "Couldn't recognize this item — fill this in yourself.");
  }
}

// ---------------------------------------------------------------------------
// Stage 3: commit
// ---------------------------------------------------------------------------

/**
 * Everything a card needs to send to `commitBulkItem`. `name`, `category`,
 * and `imageURL` are required; every other `NewInventoryItem` field is
 * optional and, when omitted, defaults to exactly the value this function
 * has always sent — so a caller passing only `{name, category, imageURL}`
 * (today's `BulkAddItemsModal` call site) gets a byte-identical payload to
 * before this type widened. `quantity` is held as a string, the same shape
 * `ItemFormModal`'s own quantity input holds, and `tags` is a plain
 * `string[]`, the same shape its tag picker holds — `commitBulkItem` itself
 * does the shape conversion to `NewInventoryItem` (a clamped number, and
 * `{ name }` objects), not the caller.
 */
export interface CommitInput {
  name: string;
  category: string;
  imageURL: string;
  /** Trimmed here; defaults to "" when omitted. */
  subcategory?: string;
  /** Trimmed here; defaults to "" when omitted. */
  location?: string;
  /**
   * Held as a string (so a caller can represent an emptied field, the same
   * reason `ItemFormModal` holds it as a string). Clamped to an integer >= 1
   * via `Math.max(1, Number(quantity) || 0)` — the same shape `ItemFormModal`
   * uses on blur and again at submit. Defaults to `1` when omitted, blank,
   * non-numeric, zero, or negative.
   */
  quantity?: string;
  /**
   * Plain tag names, the same shape `OptionPicker`'s tag picker holds;
   * converted to `{ name }[]` here. Defaults to `[]` when omitted.
   */
  tags?: string[];
  /** Trimmed here; defaults to "" when omitted. */
  notes?: string;
  /**
   * `YYYY-MM-DD`, or `""`. Always present in the built payload — `""` when
   * unset, never conditionally omitted — matching what `ItemFormModal`
   * already sends on create.
   */
  opensOn?: string;
  /** `YYYY-MM-DD`, or `""`. Same always-present rule as `opensOn`. */
  expiryDate?: string;
}

export interface CommitSuccess {
  ok: true;
  item: ApiInventoryItem;
}

export type CommitStageResult = CommitSuccess | StageFailure;

/**
 * Stage 3: builds the full `NewInventoryItem` payload — every field named
 * explicitly, never spread from another object, which is what stops a stray
 * `cutoutURL` (or any other field) from ever reaching the payload — and
 * calls `createItem`.
 *
 * Every optional `CommitInput` field is normalized here, mirroring
 * `ItemFormModal`'s own submit-time normalization: `name`, `subcategory`,
 * `location`, and `notes` are trimmed; `quantity` is clamped to an integer
 * >= 1; `tags` (plain strings) become `{ name }` objects; `opensOn` and
 * `expiryDate` are always present in the payload, `""` when unset. A field
 * omitted from `input` normalizes to exactly the value this function has
 * always sent (see `CommitInput`'s own docs). `cutoutURL` is never set —
 * the cutout pipeline stays out of scope for bulk add.
 */
export async function commitBulkItem(input: CommitInput): Promise<CommitStageResult> {
  try {
    const payload: NewInventoryItem = {
      name: input.name.trim(),
      category: input.category,
      subcategory: (input.subcategory ?? "").trim(),
      location: (input.location ?? "").trim(),
      quantity: Math.max(1, Number(input.quantity) || 0),
      tags: (input.tags ?? []).map((t) => ({ name: t })),
      notes: (input.notes ?? "").trim(),
      opensOn: input.opensOn ?? "",
      expiryDate: input.expiryDate ?? "",
      imageURL: input.imageURL,
    };
    const item = await createItem(payload);
    return { ok: true, item };
  } catch (err) {
    return toFailure(err, "Couldn't add this item — try again.");
  }
}
