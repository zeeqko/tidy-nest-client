import { describe, expect, it } from "vitest";
import { groupPayloadValue } from "./categoryGroup";

describe("groupPayloadValue", () => {
  it("sends nothing when the select was not touched", () => {
    expect(groupPayloadValue("shoes", false)).toBeUndefined();
    expect(groupPayloadValue("hidden", false)).toBeUndefined();
  });

  it("sends an empty string for Hidden", () => {
    expect(groupPayloadValue("hidden", true)).toBe("");
  });

  it("sends the group value otherwise", () => {
    expect(groupPayloadValue("bags", true)).toBe("bags");
    expect(groupPayloadValue("clothes", true)).toBe("clothes");
  });

  it("sends nothing for automatic", () => {
    expect(groupPayloadValue("auto", true)).toBeUndefined();
  });
});
