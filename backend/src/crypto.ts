// backend/src/crypto.ts
import crypto from "crypto";
import { ENV } from "./env.js";

const KEY = ENV.DATA_KEY_BASE64
  ? Buffer.from(ENV.DATA_KEY_BASE64, "base64")
  : null;

export function seal(obj: any): string {
  if (!KEY) throw new Error("DATA_KEY_BASE64 not set");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const json = Buffer.from(JSON.stringify(obj));
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function open(b64: string): any {
  if (!KEY) throw new Error("DATA_KEY_BASE64 not set");
  const raw = Buffer.from(b64, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString());
}

// Aliases para compilar y usar en routes/connections.ts
export const encrypt = seal;
export const decrypt = open;
