# CodeMung · macOS surfaces

2026-10-19. Scope: active-session popover, settings window, menu-bar usage panel and native menus. Preserve the lava companion, session detection, usage adapters and the existing sound policy.

## Audit

The original surfaces use the macOS system font but inconsistent card sizes, muted text and button treatments. Settings puts appearance, sound, connection diagnostics and updates in one long scroll. The usage panel duplicates Settings and mixes usage with application lifecycle commands. Session details require disclosure, but the panel lacks focus management and dismiss-on-blur. Menu titles change width with proportional digits; the development app exposes Electron's default application menu.

## Direction

Follow macOS utility conventions, using Apple HIG directly rather than a marketing-site style. Restrained movement, compact information density, neutral surfaces and a system-blue interaction accent. Provider logos and lava artwork retain their identity. One radius scale: 12px surfaces, 9px groups, 6px controls. Dividers group related data without stacking decorative cards.

- Settings: stable General / Sound / Connection / About toolbar, one scrolling pane; apply settings immediately; restore the last pane; title reflects the active pane. Keep diagnostic detail in a disclosure.
- Sessions: 320 × 280 panel; persistent heading, readable provider rows, counts and text-labelled states; scroll the list. Keyboard focus enters the panel; Escape, explicit close and losing window focus dismiss it. Only companion activation and real session transitions produce sound.
- Menu bar: monochrome template provider icons, monospaced usage digits, informative tooltips; anchored compact usage panel with provider sections, quiet refresh and a Settings link. Keep quit and visibility commands in native menus. Command-comma opens settings.
- Appearance: follow system light/dark mode; retain focus indicators, disabled states, semantic roles, reduced motion, increased contrast and reduced-transparency fallbacks. Electron supplies native menus/window chrome; CSS surfaces are HIG-inspired approximations of standard materials, not Apple's Liquid Glass.

## References

- [Settings](https://developer.apple.com/design/human-interface-guidelines/settings.md): persistent navigation, pane titles, remembered pane, immediate preferences and Command-comma.
- [Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers.md): compact related information, predictable dismissal and anchoring.
- [The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar.md): native menus, standard ordering and shortcuts.
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials.md): semantic materials, sparing transparency, legibility and system appearance.

## Validation

- 62 Vitest tests and 11 legacy tests pass; typecheck, production build, formatting and diff whitespace checks pass.
- Native Electron inspection: all three surfaces viewed in light and dark appearance. Confirmed Command-comma, last-pane restoration, session disclosure, Escape dismissal, focus return and usage-to-settings transition.
- Fixed clipping of the scaled lava preview, excess empty space in short session popovers and overlap of the development-only state picker.
- Dark appearance was tested only in a temporary compiled preview. The final source and running development app follow system appearance. OS-level contrast and transparency accessibility settings were not changed during validation.
