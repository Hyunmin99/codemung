# CodeMung menu bar usage implementation plan

**Goal:** Show Codex and Claude subscription quota in CodeMung's existing macOS menu bar, using each CLI's current account.

**Approved design:** Separate ChatGPT/Codex and Claude icons, five-hour usage percentages in the menu bar, and five-hour plus weekly details in a click popover. Preserve the companion, settings, and quit actions. Code implementation is delegated to `gpt-5.6-luna`; the coordinating agent reviews and verifies integration.

## Data and authentication

- Codex: launch the installed `codex app-server`, initialize its JSONL protocol, and read account/rate limits without starting an inference turn. Classify quota windows by their reported durations, preserve distinct buckets, and never relabel weekly usage as five-hour usage.
- Claude: read the CLI OAuth credential file or the `Claude Code-credentials` macOS Keychain entry, then query the OAuth usage endpoint. Keychain interaction is initiated by the user's Connect action. Do not rewrite CLI credentials, refresh tokens independently, scrape cookies, or automate terminal screens.
- Keep credentials exclusively in the main process. Expose normalized quota snapshots through a narrow preload API. Missing quota is unavailable, never zero.
- Claude's OAuth usage endpoint is an implementation-dependent integration, not a guaranteed public API. Authentication/scope failures must remain visible and actionable.

## Behavior

- Refresh at startup and every 60 seconds. Opening a popover requests fresh data when the last successful result is over 30 seconds old. Provide manual refresh and bound all requests.
- Deduplicate overlapping requests, pause polling during system sleep, refresh on wake, and clean up timers/processes at exit.
- Preserve the last successful quota on transient failure and clearly mark it stale. Clear old-account quota on authentication/account changes. Do not synthesize a reset to zero when a countdown expires.
- Display a weekly-exhaustion indicator beside the five-hour percentage. Show bucket labels and a bucket selector when Codex provides multiple buckets.
- Position the popover beneath the tray within the active display; close on outside click and Escape. Right-click retains the existing native actions.

## Implementation tasks

- [ ] Provider adapters and shared snapshot types, with fixtures covering duration mapping, missing windows, errors, and bucket separation.
- [ ] Usage scheduler with independent provider failures, deduplication, stale state, and suspend/resume cleanup.
- [ ] Provider icon assets, menu bar rendering, popover, and validated preload IPC.
- [ ] Integration review, production build, behavioral tests, live provider checks, and macOS visual verification.

## Acceptance

- Both recognizable provider icons appear in the UI and alongside their menu bar values.
- Five-hour and weekly values are derived from server quota, not local token totals.
- No secrets appear in IPC, logs, fixture data, or persisted app state.
- Missing CLI, expired credentials, unavailable quota, and transient failures do not crash the app or masquerade as unused quota.
- Existing companion dragging, settings, show/hide, and quit continue to work.
- Run `npm test` (including its production build/typecheck), inspect the rendered popover and menu bar on macOS, and report any live-authentication verification limitations explicitly.

## References

- https://github.com/openai/codex/tree/main/codex-rs/app-server
- https://github.com/steipete/CodexBar/blob/main/docs/claude.md
