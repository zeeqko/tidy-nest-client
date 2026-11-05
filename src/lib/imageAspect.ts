/** Natural size of a loaded image. */
export interface ImageSize {
  width: number;
  height: number;
}

export type ImageSizeLoader = (src: string) => Promise<ImageSize>;

export const DEFAULT_ASPECT_TIMEOUT_MS = 1500;

/** Browser loader: resolves with the image's natural size, rejects on error. */
const browserLoader: ImageSizeLoader = (src) =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = src;
  });

/**
 * Width/height aspect of the image at `src`, for sizing a new placement.
 * Never rejects and never blocks for long: resolves 1 when there is no
 * source, the image fails to load or reports a zero size, or it takes longer
 * than `timeoutMs`.
 */
export function loadImageAspect(
  src: string | undefined,
  options: { timeoutMs?: number; load?: ImageSizeLoader } = {},
): Promise<number> {
  if (!src) return Promise.resolve(1);
  const { timeoutMs = DEFAULT_ASPECT_TIMEOUT_MS, load = browserLoader } = options;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (aspect: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(aspect);
    };
    const timer = setTimeout(() => finish(1), timeoutMs);
    let pending: Promise<ImageSize>;
    try {
      pending = Promise.resolve(load(src));
    } catch {
      finish(1);
      return;
    }
    pending.then(
      ({ width, height }) => {
        const aspect = width / height;
        finish(width > 0 && height > 0 && Number.isFinite(aspect) ? aspect : 1);
      },
      () => finish(1),
    );
  });
}
