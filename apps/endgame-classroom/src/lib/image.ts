const MAX_SIDE = 560;
const QUALITY = 0.8;

/**
 * Shrinks an image to at most 560px on its longest side and re-encodes it as JPEG, so a cover
 * photo costs roughly 30–80 KB of browser storage instead of several MB.
 */
export async function imageToCover(file: Blob): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image file.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image.");
    // JPEG has no transparency: paint a dark backdrop so transparent PNGs don't turn black-on-black.
    ctx.fillStyle = "#131b25";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isImageUrl(text: string) {
  return /^https?:\/\/\S+$/i.test(text.trim());
}
