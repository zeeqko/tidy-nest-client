import { request } from "./http";

const BASE_URL = "/api/inventory";

/** Tag as carried on an item; colour is filled in by the backend. */
export interface ApiItemTag {
  name: string;
  colour?: string;
}

/** Inventory item as served by the Go backend. */
export interface ApiInventoryItem {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  subcategory: string;
  location: string;
  quantity: number;
  tags: ApiItemTag[];
  status?: string;
  notes?: string;
  /** Same-origin URL of the item's photo (e.g. /uploads/ab12.jpg). */
  imageURL?: string;
  /** Optional dates in YYYY-MM-DD form. */
  expiryDate?: string;
  opensOn?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewInventoryItem = Omit<
  ApiInventoryItem,
  "id" | "subtitle" | "status" | "createdAt" | "updatedAt"
>;

export function listItems(): Promise<ApiInventoryItem[]> {
  return request(`${BASE_URL}/`);
}

export function getItem(id: string): Promise<ApiInventoryItem> {
  return request(`${BASE_URL}/${id}`);
}

export function createItem(item: NewInventoryItem): Promise<ApiInventoryItem> {
  return request(`${BASE_URL}/`, { method: "POST", body: JSON.stringify(item) });
}

export function updateItem(id: string, item: NewInventoryItem): Promise<ApiInventoryItem> {
  return request(`${BASE_URL}/${id}`, { method: "PUT", body: JSON.stringify(item) });
}

export function deleteItem(id: string): Promise<void> {
  return request(`${BASE_URL}/${id}`, { method: "DELETE" });
}
