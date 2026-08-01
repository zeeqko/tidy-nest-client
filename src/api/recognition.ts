/** Gemini's read on a photographed item, from the "AI Recognition" upload mode. */
export interface Recognition {
  /** Matches the name of one of the caller's existing categories. */
  category: string;
  /** Short suggested name for the item, e.g. "Running Sneakers". */
  itemName: string;
}

/**
 * Sends a photo to be classified into a category + item name. Uses FormData
 * directly (not request()) for the same reason as uploadImage: a multipart
 * body must not carry a JSON Content-Type header.
 */
export async function recognizeItem(file: Blob, filename: string): Promise<Recognition> {
  const body = new FormData();
  body.append("image", file, filename);
  const response = await fetch("/api/recognize", { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Recognition failed with status ${response.status}`);
  }
  return response.json();
}
