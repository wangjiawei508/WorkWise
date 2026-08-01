## MODIFIED Requirements

### Requirement: WorkWise checks for updates in the background
WorkWise SHALL check its configured official Stable or Frontier `railwise.cn` update feed after startup and every 24 hours, and SHALL notify the user when a newer compatible signed version is available. Production clients MUST reject non-HTTPS feeds, downgrades, version mismatches, integrity failures, and untrusted packages.

#### Scenario: A newer version is available
- **WHEN** a background check finds a compatible version newer than the installed version
- **THEN** WorkWise presents a localized blue update icon whose first action starts a non-destructive background download

#### Scenario: No update is available
- **WHEN** a background check confirms the installed version is current
- **THEN** WorkWise does not interrupt the user

#### Scenario: Background check cannot reach the service
- **WHEN** an automatic check fails because of a transient network problem
- **THEN** WorkWise remains usable and does not display a blocking error

#### Scenario: Download completes
- **WHEN** updater verification confirms the complete downloaded artifact
- **THEN** the update action changes to “Restart and update” and WorkWise remains open until the user selects it

#### Scenario: User starts installation
- **WHEN** the user selects “Restart and update”
- **THEN** WorkWise flushes editable content, lists active Agent, Flow, and scheduled work, obtains confirmation when needed, checkpoints resumable work, stops the Runtime, installs through the platform updater, and relaunches without opening a browser

### Requirement: General settings exposes update status and manual checking
The General settings page SHALL display the installed version, selected Stable or Frontier channel, current update status, available version, download progress, diagnostic information, and localized actions for manual check, download, retry, and restart installation. Website download SHALL NOT be presented as the normal update path after 0.3.3.

#### Scenario: Manual check succeeds with no update
- **WHEN** the user checks for updates and the installed version is current
- **THEN** the settings page reports that WorkWise is up to date and shows the check time or current version

#### Scenario: Manual check fails
- **WHEN** the user starts a manual check and the update service returns an error
- **THEN** the settings page displays a concise localized error and allows retrying

#### Scenario: Concurrent manual checks
- **WHEN** an update check is already in progress
- **THEN** additional update buttons are disabled or join the active check rather than starting duplicate requests

#### Scenario: Download is in progress
- **WHEN** the updater is downloading an available release
- **THEN** the settings page and top-level control show consistent progress and do not exit the application

#### Scenario: Active work blocks immediate restart
- **WHEN** the install preflight finds active work or cannot flush an editor
- **THEN** the settings page keeps WorkWise open, shows the affected work or save error, and permits canceling or retrying safely
