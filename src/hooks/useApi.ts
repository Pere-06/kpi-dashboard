import { useAuth, useOrganization } from "@clerk/clerk-react";

export function useApi() {
  const { getToken } = useAuth();
  const { organization } = useOrganization();

  return async (path: string, init?: RequestInit) => {
    const token = await getToken?.();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (organization?.id) headers.set("x-org-id", organization.id);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    return res;
  };
}
