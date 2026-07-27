/** Response from the image upload endpoint. */
export interface UploadedImage {
  /** Same-origin URL the backend serves the image from (e.g. /uploads/ab12.jpg). */
  url: string;
}

/**
 * Uploads an image and returns the URL to store on the item. Uses FormData
 * directly (not request()) because multipart bodies must not have a JSON
 * Content-Type header.
 */
export async function uploadImage(file: Blob, filename: string): Promise<UploadedImage> {
  const body = new FormData();
  body.append("image", file, filename);
  const response = await fetch("/api/uploads", { method: "POST", body });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Upload failed with status ${response.status}`);
  }
  return response.json();
}
