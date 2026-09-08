# Desktop client readiness — September 7, 2026

Current result: **Claude Desktop connected and one real subscription-based synthetic MCP roundtrip passed.** The Desk preview and Claude now share `<user-home>/.underwriting-desk/reviews.sqlite`. Configuration was backed up and changed additively; no external account, paid API, or full-computer-control change was made. ChatGPT desktop and the actual workflow are now confirmed by Cooper (user-reported, not independently operated through CUA). Native Excel edit/save/reimport has now passed through the connected session; see EXCEL-NATIVE-VERIFICATION-20260907.md.

| Client | Direct observation | Current result |
| --- | --- | --- |
| Claude Desktop | Version 1.46388.4; existing subscription; actual local MCP initialize, evidence read, and proposal submission observed. | PASS for one synthetic packet. One proposal retained as PROPOSED; shared durable local store verified after restart. |
| ChatGPT desktop | CUA inventory identifies the running app as ChatGPT, bundle `com.openai.codex`. Selecting that app is rejected by the computer-use tool's safety restriction. | USER-CONFIRMED: Cooper reports the desktop connection and actual workflow succeeded. CUA restriction remains; it was not bypassed. |

## Historical read-only observation

Before the authorized setup below, Developer settings showed “No servers added.” This initial observation did not change configuration or submit inference. Claude's General settings showed computer use enabled in Background mode, Accessibility and Screen recording permissions granted, and no Chrome browsers connected. These observations establish that assisted local setup may be possible in this client; they do not establish that Claude can execute the Desk's setup instructions successfully. Switching to Full control is unnecessary for the proposed setup and was not attempted.

The next Claude action identified at that time was to apply the Desk-generated local MCP configuration to this computer's existing client configuration, preserving other settings, then perform the required reload/restart and a synthetic read/proposal roundtrip. Those configuration and restart actions were outside this read-only check. The user's prior account-change fence remains intact. A computer-mode prompt is a guided setup route, not proof that every client supports the same configuration mechanism.

ChatGPT requires direct user inspection of the supported desktop MCP settings or a separately authorized available inspection surface; this report makes no claim about the inaccessible app's actual settings. The exact tool rejection is preserved in the evidence. No inference should be drawn from installed application identity alone.

Native Excel validation remains a separate previously reported blocker; it was not repeated during this client check.

## Local evidence

- `dist/client-readiness/claude-settings-observation.txt` — relevant accessibility text transcribed from the actual settings surfaces.
- `dist/client-readiness/chatgpt-settings-blocker.txt` — exact tool rejection.

Evidence excludes unrelated chat content and personal account identifiers. These files remain in ignored local output; this report contains the reproducible finding, not a production-readiness assertion.

## Authorized Claude Desktop setup and real subscription roundtrip

**PASS for this one local Claude Desktop installation and synthetic packet.** This later check superseded the initial “not configured” observation. It does not change the ChatGPT or Excel findings.

On September 7, an additive `underwriting-desk` stdio entry was applied to the existing Claude Desktop configuration. All preexisting top-level settings were preserved and programmatically compared. A mode-0600 backup was retained at `<user-home>/Library/Application Support/Claude/claude_desktop_config.json.underwriting-desk-backup-20260907142706`. The added entry uses the detected absolute Node executable, the owned workbench's `mcp-server/server.mjs`, and `--review-store /tmp/underwriting-desk-preview-20260907.sqlite`. That initial temporary target was subsequently migrated to the durable workstation default, as recorded below.

The visible Claude conversation was idle and finished. Normal Quit and reopen loaded the configuration; no force-kill or active-task interruption warning occurred. The Desk recorded an initialize handshake at `2026-09-07T19:27:45.354Z` with self-reported client name `claude-ai`.

A new Claude conversation, titled **Synthetic MCP underwriting desk verification**, used the existing subscription interface (visible model selection: Opus 5, High). It was instructed to use only the Desk connector and the disposable `desktop-client-proof` packet. This packet contained one explicitly synthetic cash-runway figure, no actual company data, and request digest `9859fb0bb32cf1675f7c41cab01887b0d0d779f77d97e47a2851ace261c13b36`.

Claude called `get_review_context`, then `submit_evidence_review`. Each native consent was **Allow once**, never Always allow. The second call returned `AWAITING_HUMAN_REVIEW`. Independent HTTP retrieval from the local SQLite-backed review endpoint confirmed one MEDIUM challenge citing only `synthetic-runway`, the exact prepared request digest, and empty gaps/memo-drafts arrays. The app's evidence-response admission function accepted one proposal with zero dropped items; the same local-origin annotation as the UI was applied to the retained admission receipt. The proposal remains **PROPOSED**. No human acceptance was simulated or recorded.

This establishes a real Claude subscription → local MCP read → model-generated proposal → local Desk inbox roundtrip. It is distinct from the automated fixture-based UI acceptance/reload test. This native test used a disposable packet through the HTTP preparation endpoint; it did not perform an additional browser human-acceptance operation. No API credentials, paid API calls, account changes, browser-control permissions, full-control mode, remote tunnels, or deployment actions were involved. Existing subscription usage applies; no incremental API spend was introduced.

Native model conversation reference: `https://claude.ai/chat/e8014589-c383-4aac-9d16-3d155666f1fd` (private user-owned conversation, not a public share link).

Additional ignored local evidence:

- `dist/client-readiness/claude-mcp-prepared-packet.json`
- `dist/client-readiness/claude-mcp-response.json`
- `dist/client-readiness/claude-mcp-admission.json`

The user-controlled single-tool consent is a normal onboarding step, not a full-computer-access requirement. Another machine still needs a compatible installed client and runtime, its own exact paths, and its own consent. This result does not validate ChatGPT, other Claude versions, or a freshly installed packaged distribution.

## Durable local store migration and final running state

The temporary preview database was backed up with SQLite's backup API into the previously nonexistent `<user-home>/.underwriting-desk/reviews.sqlite`. The operation refused to overwrite an existing target, created the directory with mode 0700 and database with mode 0600, and retained the original `/tmp/underwriting-desk-preview-20260907.sqlite` unchanged. SQLite integrity_check returned `ok`; every row in reviews, connection_status, workspaces, and workspace_revisions matched immediately after backup (counts 2, 1, 2, and 2 respectively).

Only the owned port-4198 server was terminated normally: its process command and working directory were checked first. The server was relaunched with `node scripts/start-desk.mjs`, using the durable default with no environment override. Claude's visible verification conversation was idle/finished before its normal quit and reopen. Only the `--review-store` argument of the added Desk entry changed. A second mode-0600 configuration backup was retained at `<user-home>/Library/Application Support/Claude/claude_desktop_config.json.durable-desk-backup-20260907143238`; other settings were verified unchanged.

After restart, the Desk returned the durable path and a fresh `claude-ai` initialize timestamp of `2026-09-07T19:32:51.607Z`. The original model-generated proposal was independently fetched through the relaunched HTTP endpoint and matched the retained response exactly. The original temporary database hash remained unchanged after restart. No additional model inference or human approval occurred during migration.

Evidence: `dist/client-readiness/durable-store-migration.json`. The owned preview remains running on `http://127.0.0.1:4198`. Claude and that preview share the durable default database; neither connection now depends on the temporary database.
