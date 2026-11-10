/** Each built-in illustration's circle colour. Signup stores no colour for the
 *  default categories, so tiles fall back to this to get their tint. */
const iconColours: Record<string, string> = {
  food: "#F7C548",
  clothes: "#A98BF5",
  makeup: "#FF6B77",
  shoes: "#5DB1EA",
  bags: "#6FCB9F",
  books: "#F8A66B",
  accessories: "#E879C6",
};

/** Stored colour first, then the built-in icon's colour, else undefined. */
export function resolveCategoryColour(colour: string | undefined, iconName: string | undefined): string | undefined {
  return colour ?? (iconName ? iconColours[iconName] : undefined);
}
