/** Shared binary guards; neither imported JSON nor uploaded files may supply external image URLs. */
export const MAX_LOGO_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_LOGO_BYTES = 512 * 1024;
export const MAX_LOGO_EDGE = 512;

export function rasterInfo(bytes: Uint8Array): { mimeType: "image/png" | "image/jpeg"; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
    && String.fromCharCode(...bytes.slice(12, 16)) === "IHDR") {
    return { mimeType: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (offset < bytes.length && bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes.length) return null;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) return null;
      return { mimeType: "image/jpeg", width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
    }
    offset += length;
  }
  return null;
}

export function logoBytes(dataUrl: string): Uint8Array | null {
  if (dataUrl.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) return null;
  try {
    const raw = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
    if (raw.length > MAX_LOGO_BYTES) return null;
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch { return null; }
}
