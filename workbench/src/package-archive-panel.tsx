import {useCallback, useEffect, useState} from "react";
import {archiveAdmittedPackage, createSourceBackup, listArchivedPackages, readArchivedPackage, type PackageArchiveReceipt} from "./package-archive";
import {replayAdmittedDeal} from "./local-deal-state";
import {usesLocalWorkstation} from "./local-workspace";
import type {IntakeResult} from "./intake";

export function PackageArchivePanel({current, onRestore}: {current?: IntakeResult | null; onRestore: (result: IntakeResult) => void}) {
  const [items, setItems] = useState<PackageArchiveReceipt[]>([]);
  const [notice, setNotice] = useState("");
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const local = usesLocalWorkstation();
  const refresh = useCallback(async () => {
    setLoading(true); setListError("");
    try {setItems(await listArchivedPackages());}
    catch (error) {setListError(error instanceof Error ? error.message : "Could not load source archives.");}
    finally {setLoading(false);}
  }, []);
  useEffect(() => {if (local) void refresh();}, [local, refresh]);
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setActionError(""); setNotice("");
    try {await action();} catch (error) {setActionError(error instanceof Error ? error.message : "Archive action failed. Try again.");}
    finally {setBusy(null);}
  }
  async function archive() {
    if (!current) return;
    await run("archive", async () => {await archiveAdmittedPackage(current); setNotice("Source delivery archived locally. Analyst notes and workspace decisions are stored separately."); await refresh();});
  }
  async function restore(digest: string) {
    await run(`restore:${digest}`, async () => {const result = await replayAdmittedDeal(await readArchivedPackage(digest)); onRestore(result); setNotice("Archived source delivery verified and recalculated before opening.");});
  }
  async function backup(digest: string) {
    await run(`backup:${digest}`, async () => {
      const {filename, content} = await createSourceBackup(digest);
      const url = URL.createObjectURL(new Blob([content], {type: "application/json"}));
      const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Source backup downloaded. Use Import deal to restore it. Current notes, assumption reviews and model proposals are not included.");
    });
  }
  if (!local) return null;
  const filtered = items.filter(item => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="package-archive" aria-labelledby="package-archive-title"><header><div><p className="eyebrow">Local workstation</p><h2 id="package-archive-title">Source delivery archive</h2><p>Keep approved source packages on this computer. Restoring a delivery verifies its bytes and replays its calculations.</p></div>{current ? <button type="button" disabled={busy !== null} className="secondary-button" onClick={archive}>{busy === "archive" ? "Archiving…" : "Archive current source package"}</button> : null}</header>
    <div className="archive-toolbar"><label>Find company<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search archived deliveries" /></label><button type="button" disabled={loading} onClick={refresh}>{loading ? "Loading deliveries…" : "Refresh archive"}</button></div>
    {listError ? <div role="alert" className="archive-error"><p>{listError}</p><button type="button" disabled={loading} onClick={refresh}>Retry loading archive</button></div> : null}
    {filtered.length ? <table aria-label="Archived source deliveries"><thead><tr><th>Company</th><th>Archived</th><th>Source identity</th><th>Actions</th></tr></thead><tbody>{filtered.map(item => <tr key={item.digest}><th>{item.label}</th><td>{new Date(item.archivedAt).toLocaleString()}</td><td><details><summary>{(item.bytes / 1024).toFixed(0)} KB · Package details</summary><dl className="archive-identity"><dt>Deal</dt><dd>{item.caseId}</dd><dt>Archive SHA-256</dt><dd>{item.digest}</dd></dl></details></td><td><div className="archive-actions"><button type="button" disabled={busy !== null} onClick={() => restore(item.digest)}>{busy === `restore:${item.digest}` ? "Verifying delivery…" : "Verify and open delivery"}</button><button type="button" disabled={busy !== null} onClick={() => backup(item.digest)}>{busy === `backup:${item.digest}` ? "Preparing backup…" : "Download source backup"}</button></div></td></tr>)}</tbody></table> : !loading && !listError ? <p>{items.length ? "No archived companies match this search." : "No source deliveries have been archived yet. Admit and approve a company package first."}</p> : null}
    {actionError ? <p role="alert">{actionError} Your current delivery has not changed; retry the action when ready.</p> : null}<p role="status">{notice}</p><small>Opening a delivery uses the single local-deal slot. Source backups include original source material and recalculated screening output, but no current analyst notes or conclusions. Use Import deal to restore a source backup. Existing analyst workspace records are preserved and checked for compatibility with the restored delivery.</small></section>;
}
