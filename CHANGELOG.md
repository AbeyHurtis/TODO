# Change Log

All notable changes to the "TODO-MCP" extension will be documented in this file.

## [2.0.0] - 2026-03-16

### Added
- **Dual-Transport MCP Architecture**:
  - **Standalone Stdio MCP Server** (`bin/todo-mcp.js`): Provides on-demand, zero-port, isolated execution ideal for CLI tools, background subagents, and editors across restarts.
  - **Streamable HTTP/SSE Server**: Fully refactored HTTP transport with dynamic port allocation, multi-session tracking, and automatic inactivity pruning (15-minute timeout).
- **Expanded & Hardened MCP Tool Suite**:
  - `todo_clear_category`: Purge tasks by category or clear all tasks with a built-in safety confirmation preview step (`confirm: true/false`).
  - `todo_move_category`: Bulk migration of tasks between categories (e.g. Backlog -> Active).
  - `todo_get_tasks`: Added category filtering (`ALL`, `TODO`, `Active`, `Backlog`, `Blocked`, `Completed`) and colored status indicators (🔵, 🟠, 🟣, 🔴, 🟢).
  - Authoritative tool descriptions and JSON schemas enforcing LLM usage of MCP tools over raw `.todo` file edits.
- **Automated AI Agent In-Workspace Integration**:
  - Automatic deployment of in-workspace skills: `.agents/skills/todo-tracker/SKILL.md` (for Antigravity and Gemini CLI).
  - Automatic deployment of Cursor MDC rules: `.cursor/rules/todo.mdc`.
  - Automatic deployment of AI Agent guidelines: `AGENTS.md` and `CLAUDE.md`.
  - Automatic workspace & global configuration registration across `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/mcp_config.json`, and OS-level client configs.
- **Bidirectional File Sync & Protection**:
  - Added embedded `$instruction` metadata to `.todo` files directing AI agents to use MCP tools.
  - Debounced external file system watcher with loop-suppression to instantly reflect changes made via Stdio MCP or external tools.
- **Diagnostics, Inspection & Commands**:
  - Added dedicated `TODO MCP` output channel and unified `McpLogger` with tool call/result diagnostics.
  - `TODO: Show MCP Logs` (`todo.showMcpLogs`): Open live extension diagnostics.
  - `TODO: Verify MCP Setup & Tool Discovery` (`todo.verifyMcpSetup`): Interactive status check of ports, rules, and configurations with one-click fix buttons.
  - `TODO: Copy MCP Configuration` (`todo.copyMcpConfig`): Quick pick to copy Stdio or HTTP server JSON configs to the clipboard.
  - `TODO: Setup AI Agent Rules` (`todo.setupAgentRules`): On-demand deployment of workspace agent rules and skills.
  - `TODO: Debug MCP Server` (`todo.debugMcp`): Inspect runtime server URI and active port status.
- **Build Infrastructure**:
  - Multi-entry `esbuild` configuration bundling both `extension.ts` and `stdioServer.ts` into minified single-file outputs.
  - CLI entrypoint wrapper in `bin/todo-mcp.js` with auto-resolution of bundled scripts.

### Changed
- Refactored tool handlers into a shared `registerTodoTools` module used by both HTTP and Stdio servers.
- Automatic cleanup of stale ephemeral HTTP MCP configurations from previous editor sessions.

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