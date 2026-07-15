# user-visible-updates Specification

## Purpose
TBD - created by archiving change localize-menus-and-restore-updates. Update Purpose after archive.
## Requirements
### Requirement: WorkWise checks for updates in the background
WorkWise SHALL check its configured GitHub Release update source after startup and periodically thereafter, and SHALL notify the user when a newer compatible version is available.

#### Scenario: A newer version is available
- **WHEN** a background check finds a compatible version newer than the installed version
- **THEN** WorkWise presents a localized, non-destructive update reminder with an action to continue the update flow

#### Scenario: No update is available
- **WHEN** a background check confirms the installed version is current
- **THEN** WorkWise does not interrupt the user

#### Scenario: Background check cannot reach the service
- **WHEN** an automatic check fails because of a transient network problem
- **THEN** WorkWise remains usable and does not display a blocking error

### Requirement: General settings exposes update status and manual checking
The General settings page SHALL display the installed version, current update status, and a localized button that starts a manual update check.

#### Scenario: Manual check succeeds with no update
- **WHEN** the user checks for updates and the installed version is current
- **THEN** the settings page reports that WorkWise is up to date and shows the check time or current version

#### Scenario: Manual check fails
- **WHEN** the user starts a manual check and the update service returns an error
- **THEN** the settings page displays a concise localized error and allows retrying

#### Scenario: Concurrent manual checks
- **WHEN** an update check is already in progress
- **THEN** additional update buttons are disabled or join the active check rather than starting duplicate requests
