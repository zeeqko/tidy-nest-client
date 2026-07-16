const BASE_URL = "/api/inventory";

/** Inventory item as served by the Go backend. */
export interface ApiInventoryItem {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  subcategory: string;
  location: string;
  quantity: number;
  tag?: string;
  status?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewInventoryItem = Omit<ApiInventoryItem, "id" | "createdAt" | "updatedAt">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function listItems(): Promise<ApiInventoryItem[]> {
  return request("/");
}

export function getItem(id: string): Promise<ApiInventoryItem> {
  return request(`/${id}`);
}

export function createItem(item: NewInventoryItem): Promise<ApiInventoryItem> {
  return request("/", { method: "POST", body: JSON.stringify(item) });
}

export function updateItem(id: string, item: NewInventoryItem): Promise<ApiInventoryItem> {
  return request(`/${id}`, { method: "PUT", body: JSON.stringify(item) });
}

export function deleteItem(id: string): Promise<void> {
  return request(`/${id}`, { method: "DELETE" });
}
