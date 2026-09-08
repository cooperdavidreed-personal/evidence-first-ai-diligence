import {File as NodeFile} from "node:buffer";
import {afterEach, expect, it, vi} from "vitest";
import {createIntakeDraftStore, INTAKE_DRAFT_MAX_BYTES} from "./intake-draft";
afterEach(() => vi.unstubAllGlobals());
function memory() {
  let value: unknown;
  const persistence = {read: async () => value, write: async (next: unknown) => {value = structuredClone(next);}, clear: async () => {value = undefined;}};
  return {persistence, store: createIntakeDraftStore(persistence), corrupt: () => {const draft = value as {files: {bytes: ArrayBuffer}[]}; draft.files[0].bytes = new Uint8Array([0]).buffer;}};
}
it("resumes exact partial-package bytes across a fresh session without analysis or approval", async () => {
  vi.stubGlobal("File", NodeFile);
  const {persistence, store} = memory();
  const file = new File([new Uint8Array([0, 255, 128, 16])], "operating_model.xlsx", {type: "application/octet-stream", lastModified: 100});
  await store.save([file]);
  const resumed = await createIntakeDraftStore(persistence).load();
  expect(resumed?.files).toHaveLength(1);
  expect(new Uint8Array(await resumed!.files[0].arrayBuffer())).toEqual(new Uint8Array([0, 255, 128, 16]));
  expect(Object.keys(resumed!).sort()).toEqual(["files", "savedAt"]);
  await store.discard(); expect(await store.load()).toBeNull();
});
it("rejects a changed draft and oversized replacement without losing existing bytes", async () => {
  vi.stubGlobal("File", NodeFile);
  const {store, corrupt} = memory(); await store.save([new File(["original"], "deal.json")]);
  await expect(store.save([new File([new Uint8Array(INTAKE_DRAFT_MAX_BYTES + 1)], "large.pdf")])).rejects.toThrow(/8 MB/);
  expect(await (await store.load())!.files[0].text()).toBe("original");
  corrupt(); await expect(store.load()).rejects.toThrow(/integrity/);
});
it("keeps the previous draft on persistence failure and rejects duplicate identities", async () => {
  vi.stubGlobal("File", NodeFile);
  const {store, persistence} = memory(); await store.save([new File(["old"], "deal.json")]);
  await expect(store.save([new File(["one"], "deal.json"), new File(["two"], "deal.json")])).rejects.toThrow(/duplicate/);
  persistence.write = async () => {throw new Error("quota exceeded");};
  await expect(store.save([new File(["new"], "deal.json")])).rejects.toThrow(/quota/);
  expect(await (await store.load())!.files[0].text()).toBe("old");
});
