import { request } from "./http";

/** Category as served by the Go backend. */
export interface ApiSubCategory {
  id: number;
  name: string;
  icon: string | null;
  categoryId: number;
}

export interface ApiCategory {
  id: number;
  name: string;
  icon: string | null;
  colour: string | null;
  subCategories: ApiSubCategory[];
  /** Tags offered in this category, nested like subCategories. */
  tags: ApiTag[];
  itemCount: number;
  locations: string[];
  /** Whether items in this category track an opened-on/expiry date by default (e.g. Food, Makeup). */
  reminderOnExpiry: boolean;
}

export interface CategoryPayload {
  name: string;
  icon?: string;
  colour?: string;
}

export interface ApiTag {
  id: number;
  name: string;
  colour: string | null;
  /** Categories this tag is offered in (CategoryTags junction table). */
  categoryIds: number[];
}

export function listCategories(): Promise<ApiCategory[]> {
  return request("/api/categories/");
}

export function createCategory(payload: CategoryPayload): Promise<ApiCategory> {
  return request("/api/categories/", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCategory(id: number, payload: CategoryPayload): Promise<ApiCategory> {
  return request(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteCategory(id: number): Promise<void> {
  return request(`/api/categories/${id}`, { method: "DELETE" });
}

export function createSubCategory(categoryId: number, name: string): Promise<ApiSubCategory> {
  return request(`/api/categories/${categoryId}/subcategories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteSubCategory(id: number): Promise<void> {
  return request(`/api/subcategories/${id}`, { method: "DELETE" });
}

/** Links a tag (created by name if it doesn't exist yet) to a category. */
export function attachTag(categoryId: number, name: string): Promise<ApiTag> {
  return request(`/api/categories/${categoryId}/tags`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

/** Removes the tag from this category only; the tag survives elsewhere. */
export function detachTag(categoryId: number, tagId: number): Promise<void> {
  return request(`/api/categories/${categoryId}/tags/${tagId}`, { method: "DELETE" });
}

/** Permanently deletes a tag everywhere (all categories and items). */
export function deleteTag(id: number): Promise<void> {
  return request(`/api/tags/${id}`, { method: "DELETE" });
}
