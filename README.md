# CodeMung

> A cozy desktop companion for Claude Code and Codex.

CodeMung is a small, always-on-top macOS companion that turns AI coding activity into a calm ambient scene. The current prototype renders a state-aware lava animation in a transparent, draggable Electron window, connected to live Claude Code and Codex events through a manual hook bridge.

## Project status

CodeMung is an early MVP (`v0.1.0`) and is not ready for general use yet.

The current prototype includes:

- A transparent, frameless 280 × 280 desktop window
- An always-on-top companion that stays visible across workspaces
- A menu bar icon for showing, hiding, and quitting the app
- A lava motion pack with visual variants for `idle`, `working`, `waiting_permission`, `completed`, and `error`
- Reduced-motion support based on the system accessibility preference
- A security-conscious Electron setup with context isolation, sandboxing, and Node.js disabled in the renderer

- A token-authenticated loopback event server that accepts provider events on `127.0.0.1`
- A multi-session state store that keeps each provider independent and derives the scene state
- A shared hook bridge that turns Claude Code and Codex hook payloads into provider events

The hook installer is still planned, so hooks are connected by hand — see `docs/hook-setup.md`. Session recovery after a restart is not implemented yet.

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

The companion appears as a small floating window. Drag anywhere inside the window to reposition it. Use the CodeMung menu bar icon to show or hide the window, or to quit the app.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Electron in development mode with hot reload |
| `npm run typecheck` | Run TypeScript checks for the main, preload, and renderer code |
| `npm run build` | Type-check and create a production build |
| `npm run preview` | Preview the production build locally |

## How it is designed to work

The completed MVP will normalize events from Claude Code and Codex into a shared state model:

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

- Provide safe hook installation, backup, and removal tools
- Restore active sessions after a restart
- Add more ambient motion packs

## Privacy and security goals

CodeMung is designed to observe status, not content. The planned integration will not store or expose prompts, responses, or tool input bodies. Local events will be accepted only through `127.0.0.1` with a per-user token, and provider hooks will fail quickly without interrupting the AI tool when CodeMung is unavailable.

## Contributing

This project is still taking shape. If you find a bug or want to discuss an idea, please [open an issue](https://github.com/Hyunmin99/codemung/issues).

## License

Licensed under the ISC License.
