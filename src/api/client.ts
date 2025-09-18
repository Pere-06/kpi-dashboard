import { API_BASE } from "@/config";

function isJson(ct: string | null) {
  return !!ct && ct.toLowerCase().includes("application/json");
}
function safeParse(s: string) { try { return JSON.parse(s); } catch { return null; } }

export async function apiPOST<T = any>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
    ...init,
  });
  const ct = res.headers.get("content-type");
  const text = await res.text();

  if (!res.ok) {
    const json = isJson(ct) ? safeParse(text) : null;
    const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (isJson(ct) ? (safeParse(text) as T) : ({ ok: true, text } as any));
}

export async function apiGET<T = any>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method: "GET", credentials: "include", ...init });
  const ct = res.headers.get("content-type");
  const text = await res.text();

  if (!res.ok) {
    const json = isJson(ct) ? safeParse(text) : null;
    const msg = (json && (json.message || json.error)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (isJson(ct) ? (safeParse(text) as T) : ({ ok: true, text } as any));
}
