# localized-application-shell Specification

## Purpose
TBD - created by archiving change localize-menus-and-restore-updates. Update Purpose after archive.
## Requirements
### Requirement: Native menus follow the selected language
WorkWise SHALL render application and tray menu labels in the language selected in WorkWise settings and SHALL rebuild those menus after the language changes.

#### Scenario: User selects Chinese
- **WHEN** the user saves Chinese as the application language
- **THEN** all WorkWise-owned application, tray, and help menu labels are shown in Chinese without restarting the app

#### Scenario: User selects English
- **WHEN** the user saves English as the application language
- **THEN** all WorkWise-owned application, tray, and help menu labels are shown in English without restarting the app

### Requirement: Help actions are complete and discoverable
The Help menu SHALL expose the WorkWise homepage, product introduction, and a check-for-updates action using the selected language.

#### Scenario: User opens a help link
- **WHEN** the user chooses the homepage or product introduction item
- **THEN** WorkWise opens the corresponding official HTTPS page in the default browser

#### Scenario: User checks for updates from Help
- **WHEN** the user chooses Check for Updates
- **THEN** WorkWise starts a visible update check using the shared updater service

### Requirement: Plugin marketplace never exposes translation keys
The plugin marketplace SHALL show concise localized labels for its tabs, built-in CLI tools, recommended Skills, installation types, and user-facing errors, and MUST NOT render internal translation keys as display text.

#### Scenario: Chinese plugin marketplace
- **WHEN** the plugin marketplace is displayed in Chinese
- **THEN** tabs, Agent Reach, Ian illustrations, Guizang materials, Lark CLI, OfficeCLI, ego-lite, badges, descriptions, and actionable errors use readable Chinese text

#### Scenario: Translation resource is unavailable
- **WHEN** a built-in marketplace translation cannot be resolved
- **THEN** the UI displays a human-readable product fallback rather than the translation key
