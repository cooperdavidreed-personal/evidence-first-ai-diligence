import {File as NodeFile} from "node:buffer";
import {zipSync, strToU8} from "fflate";
import {describe, expect, it} from "vitest";
import {addPackageFiles, expandSelectionAsync, loadSyntheticSample, packageReadiness, removePackageFile, replacePackageFile, roleForName} from "./intake-package";

const TestFile = NodeFile as unknown as typeof File;
const make = (name: string, content = "x") => new TestFile([content], name, {type: "text/plain"});

describe("New Deal package assembly", () => {
  it("adds files from sequential selections instead of replacing the earlier ones", () => {
    const first = addPackageFiles([], [make("manifest.json"), make("deal.json")]);
    expect(first.files.map((item) => item.name)).toEqual(["manifest.json", "deal.json"]);
    const second = addPackageFiles(first.files, [make("operating_model.xlsx"), make("customer_arr.csv")]);
    expect(second.files.map((item) => item.name)).toEqual(["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv"]);
    expect(second.added).toEqual(["operating_model.xlsx", "customer_arr.csv"]);
    const third = addPackageFiles(second.files, [make("management_update.pdf")]);
    expect(third.files).toHaveLength(5);
    expect(packageReadiness(third.files).ready).toBe(true);
  });

  it("replaces a re-chosen file of the same name and reports the replacement", () => {
    const first = addPackageFiles([], [make("deal.json", "v1")]);
    const second = addPackageFiles(first.files, [make("deal.json", "v2"), make("customer_arr.csv")]);
    expect(second.files).toHaveLength(2);
    expect(second.replaced).toEqual(["deal.json"]);
    expect(second.added).toEqual(["customer_arr.csv"]);
    expect(second.files[0].file.size).toBe(2);
  });

  it("supports per-file remove and replace without touching the other files", () => {
    const {files} = addPackageFiles([], [make("manifest.json"), make("deal.json"), make("customer_arr.csv")]);
    const removed = removePackageFile(files, files[1].key);
    expect(removed.map((item) => item.name)).toEqual(["manifest.json", "customer_arr.csv"]);
    const replaced = replacePackageFile(removed, removed[1].key, make("customer_arr.csv", "revised"));
    expect(replaced.map((item) => item.name)).toEqual(["manifest.json", "customer_arr.csv"]);
    expect(replaced[1].file.size).toBe(7);
    expect(replaced[1].key).not.toBe(removed[1].key);
  });

  it("explains missing requirements in plain language and blocks analysis until they are met", () => {
    const {files} = addPackageFiles([], [make("manifest.json"), make("deal.json"), make("operating_model.xlsx"), make("notes.txt")]);
    const readiness = packageReadiness(files);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing.map((item) => item.role)).toEqual(["customers", "management-update"]);
    expect(readiness.summary).toContain("Analysis is blocked until 2 required files are added");
    expect(readiness.summary).toContain("Customer data (customer_arr.csv)");
    expect(readiness.unrecognized.map((item) => item.name)).toEqual(["notes.txt"]);
    expect(readiness.checklist.map((item) => item.state)).toEqual(["present", "present", "present", "missing", "missing"]);
  });

  it("treats the management update as optional for the CSV quick package", () => {
    const {files} = addPackageFiles([], [make("manifest.json"), make("deal.json"), make("monthly_financials.csv"), make("customer_arr.csv")]);
    const readiness = packageReadiness(files);
    expect(readiness.ready).toBe(true);
    expect(readiness.checklist.at(-1)?.state).toBe("optional");
  });

  it("recognizes roles from declared names only, including paths from folders", () => {
    expect(roleForName("Northstar/package/operating_model.xlsx")).toBe("operating-model");
    expect(roleForName("MANIFEST.JSON")).toBe("declaration");
    expect(roleForName("board_deck.pdf")).toBeNull();
  });

  it("expands a dropped ZIP archive into its member files and skips folder noise", async () => {
    const archive = zipSync({
      "package/manifest.json": strToU8("{}"),
      "package/deal.json": strToU8("{}"),
      "package/__MACOSX/._deal.json": strToU8("junk"),
      "package/.DS_Store": strToU8("junk"),
      "package/nested/": new Uint8Array(),
    });
    const zip = new TestFile([archive], "northstar-package.zip", {type: "application/zip"});
    const {files, archives, skipped} = await expandSelectionAsync([zip, make("customer_arr.csv")]);
    expect(archives).toEqual(["northstar-package.zip"]);
    expect(skipped).toEqual([]);
    expect(files.map((item) => item.name).sort()).toEqual(["customer_arr.csv", "deal.json", "manifest.json"]);
  });

  it("reports an unreadable archive instead of silently dropping it", async () => {
    const {files, skipped} = await expandSelectionAsync([make("broken.zip", "not a zip")]);
    expect(files).toEqual([]);
    expect(skipped).toEqual(["broken.zip"]);
  });

  it("loads the complete synthetic sample with one request per declared file", async () => {
    const requested: string[] = [];
    const fetchFn = (async (url: string) => {
      requested.push(url);
      return {ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("sample").buffer} as unknown as Response;
    }) as unknown as typeof fetch;
    const files = await loadSyntheticSample("sample-package-v2/", fetchFn);
    expect(files.map((item) => item.name)).toEqual(["manifest.json", "deal.json", "operating_model.xlsx", "customer_arr.csv", "management_update.pdf"]);
    expect(requested).toHaveLength(5);
    expect(packageReadiness(addPackageFiles([], files).files).ready).toBe(true);
  });
});
