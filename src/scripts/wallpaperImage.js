// Bound the decoded display texture, not just its compressed file size.
// Keep the full composition; CSS performs the one viewport-dependent crop.
export function wallpaperImageSize(image, viewport = window) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!(width > 0 && height > 0)) throw new Error('Invalid wallpaper dimensions');
  const pixelRatio = Math.max(1, viewport.devicePixelRatio || 1);
  const maxEdge = Math.min(2048,
    Math.ceil(Math.max(viewport.innerWidth, viewport.innerHeight) * pixelRatio));
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}
