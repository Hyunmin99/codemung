# Provider icon provenance

CodeMung uses the OpenAI knot and Claude starburst paths from Simple Icons:

- OpenAI/Codex: https://raw.githubusercontent.com/simple-icons/simple-icons/14.0.0/icons/openai.svg
- Claude: https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/claude.svg

Simple Icons publishes its icon artwork under CC0 1.0. The source artwork is used without modification; `providerIconSvg` only supplies the shared 24 by 24 SVG wrapper and black fill used by the UI.

The OpenAI, Codex, Claude, and Anthropic names and marks remain trademarks of their respective owners. CC0 artwork licensing does not grant trademark rights or imply endorsement.

The PNG exports in `src/shared/provider-icons.ts` are 36 by 36 transparent PNG rasterizations generated from these exact SVGs with the bundled `sharp` runtime. They are base64 encoded for Electron `nativeImage.createFromDataURL` consumers.
