# Changelog

## v0.3.1 - 2026-09-23

### Changed

- Reduced node-title and CPU, memory, disk, and traffic percentage text sizes for a more balanced card hierarchy.

## v0.3.0 - 2026-09-23

### Changed

- Renamed the theme to `Komari Emerald Compact` and assigned the short identifier `KomariEmeraldCompact`.
- Refined node-card typography, spacing, and compact metric layout.
- Kept long traffic totals and live rates readable with compact formatting and full-value tooltips.
- Added remaining-time and estimated remaining-value details to node cards.
- Matched Telecom, Unicom, and Mobile latency and packet-loss panels to their corresponding provider data.

## v0.2.0 - 2026-09-21

### Changed

- Renamed the theme to `Komari Emerald Custom`.
- Changed the theme short identifier to `KomariEmeraldCustom` to avoid collisions with the original Emerald theme.
- Reset the theme version to `0.2.0`.

## v1.29.2 - 2026-09-21

### Fixed

- Corrected the default RPC endpoint to `/api/rpc2` so packaged themes can load public node data without a local `.env` file.

## v1.29.1 - 2026-09-21

### Added

- Provider-specific Ping display for Telecom, Unicom, and Mobile tasks.
- Historical Ping trend bars for provider latency and packet loss.

### Changed

- Preserved the original compact node-card layout on desktop and mobile.
- Kept Ping and packet-loss indicators as narrow rounded vertical bars.
- Corrected the theme links and release instructions for the ArunQuan repository.

### Release contents

- One `komari-theme-emerald-build-*.zip` package for direct Komari theme import.
- Source code, theme manifest, preview image, and build workflow.

This release does not include probe databases, runtime snapshots, account data, server configuration, tokens, or private keys.
