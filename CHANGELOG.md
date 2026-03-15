# Change Log

All notable changes to the "TODO-MCP" extension will be documented in this file.

## [0.0.5] - 2026-03-14

### Added
- **Storage Switch UI**: Integrated buttons in the sidebar header to toggle between Global and Project storage.
- **Subtle Visual Feedback**: Refined icon highlighting with a soft glow to indicate the active storage mode.

### Changed
- **Header Layout**: Improved sidebar readability with a new `composite-title` grouping for project names and storage controls.

## [0.0.4] - 2026-03-14

### Added
- **File-Based Storage**: Implemented local `.todo` JSON file storage in the project root for 100% reliable project separation.
- **Default Storage Policy**: Changed default storage to `file` mode for better project isolation.

## [0.0.3] - 2026-03-14

### Added
- **Per-Project Storage**: Choice between `global`, `workspaceState`, and `file` storage scopes.
- **MCP Conflict Resolution**: Unique MCP server registration per VS Code window to prevent configuration collisions across multiple projects.
- **Storage Indicator**: Sidebar header now displays the active storage scope (e.g., [File], [Global]).

## [0.0.2] - 2026-03-14

### Added
- **Performance Optimization**: Implemented extension bundling with `esbuild`.
- **Package Slimming**: Optimized `.vscodeignore` to exclude `node_modules` and source files, reducing package size by 90%.
- **Branding**: Set official Marketplace icon by converting sidebar SVG to 128x128 PNG.

### Changed
- **Marketplace Identity**: Renamed extension to `TODO-MCP` to avoid conflicts in the Marketplace.

## [0.0.1] - 2026-03-13

### Added
- **AI/MCP Integration**: Natively integrated Model Context Protocol (MCP) server for autonomous task management.
- **Cursor IDE Native API**: Automatic registration into Cursor via SSE transport.
- **Git Heuristics**: Background tracker for automatic task completion based on commits.
- **Drag and Drop Interface**: Flexible task organization across categories.
- **UI Enhancements**: Advanced Date Picker, flash animations, and Clean View toggle.

### Fixed
- UI state desync issues and "Server Already Initialized" connection errors.