import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {PackageArchivePanel} from "./package-archive-panel";
const api = vi.hoisted(() => ({list: vi.fn(), read: vi.fn(), backup: vi.fn(), replay: vi.fn()}));
vi.mock("./local-workspace", () => ({usesLocalWorkstation: () => true}));
vi.mock("./package-archive", () => ({listArchivedPackages: api.list, readArchivedPackage: api.read, createSourceBackup: api.backup, archiveAdmittedPackage: vi.fn()}));
vi.mock("./local-deal-state", () => ({replayAdmittedDeal: api.replay}));
const rows = ["Atlas", "Helios"].map((label, index) => ({label, digest: String(index).repeat(64), caseId: `local-${label}`, bytes: 1024, archivedAt: "2026-09-07T12:00:00Z"}));
beforeEach(() => {vi.clearAllMocks(); api.list.mockResolvedValue(rows);});
describe("source archive controls", () => {
  it("retries a failed listing without presenting failure as an empty archive", async () => {
    api.list.mockRejectedValueOnce(new Error("Storage is unavailable"));
    render(<PackageArchivePanel onRestore={vi.fn()} />);
    expect(await screen.findByText("Storage is unavailable")).toBeTruthy();
    expect(screen.queryByText(/No source deliveries/)).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "Retry loading archive"}));
    expect(await screen.findByText("Atlas")).toBeTruthy();
    expect(screen.queryByText("Storage is unavailable")).toBeNull();
  });
  it("filters by company and keeps failed integrity checks from activating a delivery", async () => {
    api.read.mockRejectedValueOnce(new Error("Source digest mismatch"));
    const restore = vi.fn(); render(<PackageArchivePanel onRestore={restore} />);
    await screen.findByText("Atlas");
    fireEvent.change(screen.getByRole("searchbox", {name: "Find company"}), {target: {value: "heli"}});
    expect(screen.queryByText("Atlas")).toBeNull();
    expect(screen.getByText("Helios")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Verify and open delivery"}));
    await screen.findByText(/Source digest mismatch/);
    expect(api.replay).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled();
    await waitFor(() => expect((screen.getByRole("button", {name: "Verify and open delivery"}) as HTMLButtonElement).disabled).toBe(false));
  });
});
