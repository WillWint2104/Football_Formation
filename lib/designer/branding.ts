import type { PortableLogo } from "./contract";
import { logoSchema } from "./contract";
import { MAX_LOGO_BYTES, MAX_LOGO_EDGE, MAX_LOGO_FILE_BYTES, logoBytes, rasterInfo } from "./images";

/** Actual browser decoding supplements the shared header checks before accepting any imported logo. */
export async function verifyLogo(logo: PortableLogo) {
  logoSchema.parse(logo);
  const bytes = logoBytes(logo.dataUrl)!;
  const image = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: logo.mimeType }));
  try { if (image.width !== logo.width || image.height !== logo.height) throw new Error("Logo dimensions do not match the decoded image."); }
  finally { image.close(); }
}

/** Re-encode bounded, decoded raster pixels; preserve alpha and aspect ratio, discard uploaded metadata. */
export async function prepareLogo(file: File): Promise<PortableLogo> {
  if (!file.size || file.size > MAX_LOGO_FILE_BYTES) throw new Error("Choose a PNG or JPEG up to 4 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer()), info = rasterInfo(bytes);
  if (!info || !["image/png", "image/jpeg"].includes(file.type) || file.type !== info.mimeType) throw new Error("The file must be a genuine PNG or JPEG image. SVG and other formats are not accepted.");
  if (info.width < 1 || info.height < 1 || info.width > 4096 || info.height > 4096 || info.width * info.height > 16000000) throw new Error("Logo dimensions must be at most 4096 × 4096 pixels (16 megapixels).");
  const image = await createImageBitmap(new Blob([bytes], { type: info.mimeType }));
  try {
    // JPEG EXIF orientation may swap the decoded dimensions. Re-encoding strips that metadata.
    if (image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096 || image.width * image.height > 16000000) throw new Error("Decoded image dimensions exceed the logo limits.");
    const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(image.width, image.height)), canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Image processing is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mimeType = info.mimeType, dataUrl = canvas.toDataURL(mimeType, .9);
    if (!logoBytes(dataUrl) || dataUrl.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32) throw new Error("The resized logo is too large. Choose a simpler image (512 KB after resizing).");
    return logoSchema.parse({ name: file.name.slice(0, 200) || "club-logo", mimeType, width: canvas.width, height: canvas.height, dataUrl });
  } finally { image.close(); }
}

/** Choose readable text against any user-picked header/number colour. */
export function contrastingInk(hex: string): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}
