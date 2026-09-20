# CodeMung

> A cozy desktop companion for Claude Code and Codex.

CodeMung is a small, always-on-top macOS companion that turns AI coding activity into a calm ambient scene. It currently detects recent Claude Code and Codex sessions from local session-log metadata and renders them in the companion.

## Project status

CodeMung is an early MVP (`v0.1.0`) and is not ready for general use yet.

The current prototype includes:

- A transparent, frameless 280 × 280 desktop window
- An always-on-top companion that stays visible across workspaces
- Separate Codex (ChatGPT) and Claude menu bar icons with five-hour subscription usage
- A usage popover with five-hour and weekly quotas, reset countdowns, and refresh/connection status
- A lava motion pack with visual variants for `idle`, `working`, `waiting_permission`, `completed`, and `error`
- Reduced-motion support based on the system accessibility preference
- A security-conscious Electron setup with context isolation, sandboxing, and Node.js disabled in the renderer

The main process checks Claude Code and Codex session-log file metadata every two seconds and shows logs modified within the last five minutes. It does not read prompt or response content. Hook-based event updates and richer provider state mapping remain planned.

## Getting started

### Prerequisites

- macOS
- Node.js and npm

### Install and run

```bash
git clone https://github.com/Hyunmin99/codemung.git
cd codemung
npm install
npm run dev
```

The companion appears as a small floating window. Drag anywhere inside the window to reposition it. Click either provider's menu bar item to inspect usage. The popover and right-click menu provide companion visibility, settings, and quit actions.

### Subscription usage

Sign in with the installed Codex and Claude Code CLIs. CodeMung displays the **percentage used**, not the percentage remaining. It reads server quota rather than estimating it from local token logs.

- **Codex:** Uses `codex app-server` to read the current account's five-hour and weekly limits. API-key accounts do not expose ChatGPT subscription quota. If several quota buckets are returned, select the desired bucket in the popover.
- **Claude:** Uses the CLI's OAuth credentials. On macOS, click **Claude 연결** to read the CLI's Keychain entry; macOS may request access. CodeMung does not rewrite the CLI's credentials. The OAuth usage endpoint is not a guaranteed public API, so expired credentials or unsupported responses require reconnection or a future adapter update.
- Refresh runs every 60 seconds while awake. A dash means no quota is available; old values are marked stale when a refresh fails. A weekly-exhaustion marker does not replace the five-hour percentage.

Authentication stays in the Electron main process. Tokens are not sent to the renderer or saved in CodeMung settings. The first version does not import browser cookies or provide account switching, billing analysis, or usage history.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Electron in development mode with hot reload |
| `npm run typecheck` | Run TypeScript checks for the main, preload, and renderer code |
| `npm run build` | Type-check and create a production build |
| `npm run preview` | Preview the production build locally |

## How it is designed to work

The current session feed polls local session-log metadata in the Electron main process every two seconds, then sends session snapshots through preload IPC to the renderer. Logs modified within the last five minutes are treated as working sessions. Codex project names come from the session metadata header; Claude project names come from the log's project directory. Prompt and response content is not read. Hook-based event normalization and richer state mapping remain planned.

The planned hook event flow is:

```text
Claude Code / Codex hooks
          ↓
    Local hook bridge
          ↓
 Electron main process
          ↓
  Shared session store
          ↓
      Preload IPC
          ↓
 React ambient scene
```

Each provider can have multiple active sessions. CodeMung will keep their states independently and select one representative scene using this priority:

```text
waiting_permission > error > completed > working > idle
```

See [the MVP 0.1 specification](docs/mvp-0.1.md) for the planned event model, security constraints, and implementation milestones.

## Project structure

```text
src/
├── main/                 Electron lifecycle, window, tray, and IPC
├── preload/              Minimal renderer-facing Electron API
└── renderer/
    └── src/
        ├── motion/       Motion registry, state model, and scene renderer
        ├── App.tsx       Companion UI and representative-state selection
        └── styles.css    Window layout and accessibility styles
docs/
└── mvp-0.1.md            MVP scope and technical design notes
```

## Tech stack

- Electron
- React
- TypeScript
- Vite and electron-vite
- SVG and CSS animation

## Roadmap

- Normalize hook events into richer live session states
- Receive local events through an authenticated loopback server
- Normalize real Claude Code and Codex hook payloads
- Provide safe hook installation, backup, and removal tools
- Persist window position and restore active sessions
- Add more ambient motion packs

## Privacy and security goals

CodeMung is designed to observe status, not content. The planned integration will not store or expose prompts, responses, or tool input bodies. Local events will be accepted only through `127.0.0.1` with a per-user token, and provider hooks will fail quickly without interrupting the AI tool when CodeMung is unavailable.

## Contributing

This project is still taking shape. If you find a bug or want to discuss an idea, please [open an issue](https://github.com/Hyunmin99/codemung/issues).

## License

Licensed under the ISC License.
