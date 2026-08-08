// Shared image-prep helpers. Currently just the upload downscale used by
// `ItemFormModal` (item photos) and, per PLAN.md T2, the look-builder's
// cutout pipeline (a photo fetched from a `/uploads/...` URL as a `Blob`,
// which has no filename of its own).

export const MAX_PHOTO_DIMENSION = 1280;

/**
 * Downscales a photo to a phone-friendly upload size (JPEG, longest side
 * MAX_PHOTO_DIMENSION). Falls back to the original input if decoding or
 * encoding fails — never throws, so callers can always use the result.
 *
 * `defaultFilename` is used only on that fallback path, when `source` has no
 * `name` of its own (e.g. a `Blob` rather than a `File`) — mirrors the
 * previous `file.name || "photo"` behavior for `File` inputs.
 */
export async function preparePhoto(
  source: Blob,
  defaultFilename: string = "photo",
): Promise<{ blob: Blob; filename: string }> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob) throw new Error("canvas export failed");
    return { blob, filename: "photo.jpg" };
  } catch {
    const filename = source instanceof File ? source.name || defaultFilename : defaultFilename;
    return { blob: source, filename };
  }
}
