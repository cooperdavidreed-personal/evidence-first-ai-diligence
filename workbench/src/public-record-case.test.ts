import {describe, expect, it} from "vitest";
import {SNOWFLAKE_CUTOFF, SNOWFLAKE_SOURCES, validatePublicRecordCase} from "./public-record-case";

describe("Snowflake public-record retrospective", () => {
  it("admits only filings available by the historical cutoff", () => {
    expect(validatePublicRecordCase()).toEqual({state: "PASS", admitted: 2, excluded: 2});
    expect(SNOWFLAKE_SOURCES.filter((source) => source.state === "ADMITTED").every((source) => Date.parse(source.filedAt) <= Date.parse(SNOWFLAKE_CUTOFF))).toBe(true);
    expect(SNOWFLAKE_SOURCES.filter((source) => source.state === "EXCLUDED_POST_CUTOFF").every((source) => Date.parse(source.filedAt) > Date.parse(SNOWFLAKE_CUTOFF))).toBe(true);
  });

  it("rejects a post-cutoff filing mislabeled as admitted", () => {
    const corrupted = SNOWFLAKE_SOURCES.map((source) => source.id === "snow-424b4" ? {...source, state: "ADMITTED" as const} : source);
    expect(() => validatePublicRecordCase(corrupted)).toThrow(/Temporal classification mismatch/);
  });
});
