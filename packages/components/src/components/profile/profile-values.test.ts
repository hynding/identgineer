import { describe, expect, it } from "vitest";
import { profileInput, timeZoneOptions } from "./profile-values";

const VALUES = {
  displayName: "Ada",
  bio: "",
  locale: "",
  timezone: "",
  marketingOptIn: false,
};

describe("profileInput", () => {
  it("clears an empty bio and leaves an empty language and time zone out", () => {
    expect(profileInput(VALUES)).toEqual({ displayName: "Ada", bio: null, marketingOptIn: false });
  });

  it("sends what is filled in", () => {
    expect(
      profileInput({ ...VALUES, bio: "Hi", locale: "en-GB", timezone: "Europe/London" }),
    ).toEqual({
      displayName: "Ada",
      bio: "Hi",
      locale: "en-GB",
      timezone: "Europe/London",
      marketingOptIn: false,
    });
  });
});

describe("timeZoneOptions", () => {
  it("lists the browser's zones in order and adds a saved one it lacks", () => {
    const zones = timeZoneOptions("Mars/Olympus_Mons");
    expect(zones).toContain("Europe/London");
    expect(zones).toContain("Mars/Olympus_Mons");
    expect([...zones].sort()).toEqual(zones);
    expect(timeZoneOptions(null)).not.toContain("Mars/Olympus_Mons");
  });
});
