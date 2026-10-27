import * as FileSystem from "expo-file-system/legacy";

export {
  decryptPayload,
  embedImage,
  encryptPayload,
  extractImage,
  ENCRYPTED_MIME_TYPE,
  validatePayloadCapacity,
  type CapacityCheck,
  type ExtractedPayload,
} from "./steganography-core";

export async function readImageBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function writeImageBase64(base64: string, mimeType: string, requestedName?: string) {
  const extension = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
  const safeName = (requestedName ?? "stegahide-result")
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "stegahide-result";
  const uri = `${FileSystem.cacheDirectory}${safeName}-${Date.now()}.${extension}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
