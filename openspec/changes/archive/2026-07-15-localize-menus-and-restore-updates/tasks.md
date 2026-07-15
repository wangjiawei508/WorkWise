## 1. Localized application shell

- [x] 1.1 Inventory current language persistence, native application menu, tray menu, and help actions
- [x] 1.2 Implement localized native application/help menu templates and rebuild them when language changes
- [x] 1.3 Localize tray and native update-related labels with safe language fallback
- [x] 1.4 Add official homepage, product introduction, and check-for-updates Help actions

## 2. Plugin marketplace clarity

- [x] 2.1 Add complete Chinese and English strings for CLI tabs, built-in CLI tools, recommended Skills, and badges
- [x] 2.2 Add human-readable fallbacks so unresolved translation keys never appear in built-in marketplace cards
- [x] 2.3 Simplify and localize Skill/CLI installation errors while preserving optional technical details
- [x] 2.4 Add translation parity and marketplace rendering regression tests

## 3. Update experience

- [x] 3.1 Audit updater startup wiring and restore background scheduled checks and available-update reminders
- [x] 3.2 Expose a single-flight manual update check and consistent status through the existing IPC/preload API
- [x] 3.3 Add current version, update status, and check-for-updates action to General settings
- [x] 3.4 Add updater state, background behavior, Help action, and General settings tests

## 4. Chinese-first documentation

- [x] 4.1 Rewrite and visually structure the root README as a Chinese-first product overview with English entry
- [x] 4.2 Create or rewrite the dedicated Chinese product introduction and link it from README and Help
- [x] 4.3 Verify all public links, installation instructions, update guidance, and repository screenshots

## 5. Verification

- [x] 5.1 Run OpenSpec strict validation and brand-boundary verification
- [x] 5.2 Run targeted tests, TypeScript, ESLint, and production build
- [x] 5.3 Visually verify Chinese and English menus, plugin marketplace, Help actions, and General update settings

## 6. Release blockers

- [x] 6.1 Upgrade and lock production dependencies until the high/critical production audit gate passes
- [x] 6.2 Make after-pack output ASAR-consistent and add a final archive integrity regression test
- [x] 6.3 Add deterministic end-to-end managed CLI tests for all IPC operations, checksum validation, rollback, and cleanup
- [x] 6.4 Validate live upstream metadata/download behavior for Lark CLI, OfficeCLI, and ego-browser without touching user data
- [x] 6.5 Validate final macOS arm64/x64 and Windows x64 packages, metadata, hashes, and real packaged-app UI
- [x] 6.6 Re-run the complete release gate and record that no blocker remains before publishing
