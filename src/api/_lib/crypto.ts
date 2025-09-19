import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const keyB64 = process.env.APP_ENC_KEY || "";
if (!keyB64) throw new Error("APP_ENC_KEY missing");
const key = Buffer.from(keyB64, "base64"); // 32 bytes

export function encryptJSON(obj: any): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // [12 IV][16 TAG][N DATA]
}

export function decryptJSON(buf: Buffer): any {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}
