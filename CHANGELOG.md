# Changelog

## v0.3.8 - 2026-11-28

### Changed

- Consolidated the 3-carrier Ping/loss panels in `NodeCard` into a single container, added expiration warning pill colors, dynamic traffic status bars, unified offline blur, and keyboard focus support.
- Fixed the memory summary card icon (`tabler:cpu-2`), replaced invalid `text-md` with `text-lg` + `tabular-nums`, and teleported the finance/exchange-rate popup with viewport clamping and outside-click/`Escape` dismissal.
- Clamped `PingBars` edge tooltips, added 3-state sort cycling (asc → desc → default), and prevented desktop search expansion from overlapping toolbar buttons while adding a dedicated mobile search bar.
- Added `v4`/`v6` badges to `NodeList`, refined dark-mode `emerald`/`sky` semantic contrast, unified icons to `tabler:*`, raised sticky header contrast, and switched route transitions to a crisp blur-free animation.
- Replaced empty finance cards on free/unpriced nodes in `InstanceDetail` with live CPU/RAM/Disk/Uptime metric cards, enabled `confine: true` and aligned tooltips in `LoadChart` and `PingChart`, and cleared mobile footer/`BackTop`/`VisitorInfoCard` overlap.

### Engineering

- Split local preview and ZIP packaging into build plugins; fail on missing release inputs.
- Preserve Ping results while scanning sorted history once per bucket pass.
- Remove three unused development dependencies and commit a frozen Bun lockfile.
- Pin Bun 1.4.4 and patched build-tool transitive dependencies; add read-only lint and build CI.
- Default the development server to loopback and skip release installs when the version is unchanged.

## v0.3.3 - 2026-09-23

### Changed

- Set all four resource percentages to 11px and the foreground color.

## v0.3.2 - 2026-09-23

### Changed

- Matched the CPU usage percentage text size and weight to the CPU label for comparison.

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
