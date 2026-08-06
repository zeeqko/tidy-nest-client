import { request } from "./http";

const BASE_URL = "/api/looks";

/** A single inventory item placed on a Look's canvas, with the transform it
 *  was arranged with. `name`/`imageURL`/`cutoutURL` are response-only
 *  (backend-filled by joining Inventories) and ignored on write. */
export interface ApiLookItem {
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  name?: string;
  imageURL?: string;
  cutoutURL?: string;
}

/** A saved outfit "look" as served by the Go backend. */
export interface ApiLook {
  id: string;
  name: string;
  occasion: string;
  items: ApiLookItem[];
  createdAt: string;
  updatedAt: string;
}

// Write path only needs itemId + transform per item — name/imageURL are
// response-only and ignored by the backend on write.
export type NewLookItem = Pick<
  ApiLookItem,
  "itemId" | "x" | "y" | "width" | "height" | "rotation" | "zIndex"
>;

export type NewLook = Omit<ApiLook, "id" | "createdAt" | "updatedAt" | "items"> & {
  items: NewLookItem[];
};

export function listLooks(): Promise<ApiLook[]> {
  return request(`${BASE_URL}/`);
}

export function getLook(id: string): Promise<ApiLook> {
  return request(`${BASE_URL}/${id}`);
}

export function createLook(look: NewLook): Promise<ApiLook> {
  return request(`${BASE_URL}/`, { method: "POST", body: JSON.stringify(look) });
}

export function updateLook(id: string, look: NewLook): Promise<ApiLook> {
  return request(`${BASE_URL}/${id}`, { method: "PUT", body: JSON.stringify(look) });
}

export function deleteLook(id: string): Promise<void> {
  return request(`${BASE_URL}/${id}`, { method: "DELETE" });
}
