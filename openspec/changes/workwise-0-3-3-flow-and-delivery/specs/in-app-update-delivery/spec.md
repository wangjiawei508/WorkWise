## ADDED Requirements

### Requirement: Production packages use official channel feeds
Stable packages SHALL use `https://www.railwise.cn/downloads/workwise/channels/stable/latest/` and Frontier packages SHALL use the corresponding `frontier` path, with environment overrides limited to development or enterprise deployment.

#### Scenario: Production Stable client resolves its feed
- **WHEN** a signed Stable package initializes the updater without an authorized deployment override
- **THEN** it uses the embedded HTTPS Stable URL under `railwise.cn`

#### Scenario: Feed is insecure or represents a downgrade
- **WHEN** production metadata uses non-HTTPS, an older version, or mismatched artifact/version data
- **THEN** the client rejects the update before download or installation

### Requirement: Update check and download are non-destructive stages
WorkWise SHALL check after startup and every 24 hours, display a blue update icon for a newer compatible version, and require a first user action to begin background download without exiting.

#### Scenario: User clicks available-update icon
- **WHEN** a newer version is available but not downloaded
- **THEN** WorkWise downloads it in the background, remains open, and displays determinate or indeterminate progress

#### Scenario: Download fails
- **WHEN** the updater reports a network, manifest, or integrity error
- **THEN** WorkWise remains usable, shows concise diagnostics, and offers retry without opening a browser

### Requirement: Installation requires explicit restart and safe preflight
After download, WorkWise SHALL change the action to “Restart and update,” flush editable content, inspect active Agent, Flow, and scheduled work, and require confirmation when active work would be affected.

#### Scenario: No active work exists
- **WHEN** the user selects “Restart and update” and editor flush succeeds
- **THEN** WorkWise checkpoints recoverable state, stops Runtime services, invokes the platform updater, exits, installs, and relaunches automatically

#### Scenario: Active work exists
- **WHEN** Agent turns, Flow runs, or scheduled tasks are active
- **THEN** WorkWise displays the affected work and does not exit until the user confirms or cancels

#### Scenario: Editor flush fails
- **WHEN** unsaved editable content cannot be persisted
- **THEN** WorkWise cancels installation and reports the save failure

### Requirement: Update settings remain fully observable
General settings SHALL retain manual check, channel selection, installed and available version, download progress, retry, and diagnostic information without presenting website reinstall as the normal update path.

#### Scenario: User manually checks for updates
- **WHEN** the user starts a check from settings
- **THEN** duplicate requests join or disable against the active check and the page reports the final localized state

### Requirement: Release assets are immutable until atomic promotion
The release pipeline SHALL upload versioned ZIP, EXE, blockmap, `latest.yml`, `latest-mac.yml`, and SHA-512 metadata to R2, verify them after upload, and atomically promote the channel’s latest pointer only after all checks pass.

#### Scenario: One required artifact is missing or mismatched
- **WHEN** signing, manifest, version, hash, download, or Range verification fails
- **THEN** promotion fails and existing channel metadata remains unchanged

#### Scenario: All artifacts pass
- **WHEN** every supported platform artifact and metadata file passes verification
- **THEN** the pipeline promotes the release atomically and retains the three most recent installable versions

### Requirement: Stable macOS updates are signed and notarized
Stable macOS arm64 and x64 packages SHALL use Developer ID signing and successful Apple notarization, and the release pipeline SHALL fail if either is absent.

#### Scenario: macOS signing or notarization is missing
- **WHEN** a Stable candidate lacks a valid signature, hardened runtime, stapled notarization result, or matching updater metadata
- **THEN** it is not marked installable and Stable promotion fails

### Requirement: 0.3.2 uses a one-time signed bootstrap
WorkWise SHALL document that public 0.3.2 users manually install signed 0.3.3 once and SHALL NOT weaken signature or update-source verification to automate that transition.

#### Scenario: User is on public 0.3.2
- **WHEN** the user wants the official in-app update channel
- **THEN** documentation directs one final manual signed 0.3.3 installation, after which later updates occur in-app
