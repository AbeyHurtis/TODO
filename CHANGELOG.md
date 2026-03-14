# Change Log

All notable changes to the "TODO" extension will be documented in this file.

## [1.0.0] - Initial Major Overview

### Added
- **AI/MCP Integration**: Natively integrated Model Context Protocol (MCP) server. LLM agents (Cursor, Claude, Roo) can now autonomously read, add, update, and delete tasks in bulk from unstructured conversations.
- **Cursor IDE Native API**: Added automatic registration into Cursor via `cursor.mcp.registerServer` using SSE transport. No manual `mcp.json` required.
- **Git Heuristics**: Added a background tracker that automatically marks active tasks as Completed when committed, or Blocked if failures are detected in commit contexts.
- **Drag and Drop Interface**: Reorder tasks and move them between categories (TODO, Active, Blocked, Backlog, Completed) simply by dragging.
- **Extensive UI Improvements**: 
  - Advanced keyboard-friendly Date Picker with tab navigation and Quick Add (`Cmd/Ctrl+Enter`).
  - Flash animations for newly inserted tasks.
  - "Clean View" button to toggle empty categories to save space.
- **Branding**: Set official Marketplace icon by converting sidebar SVG to 128x128 PNG (`resources/icon.png`).
- **Security Enhancements**: Patched internal string rendering (`innerHTML` vs `textContent`) to strictly prevent XSS payloads from interacting agents.

### Fixed
- Fixed UI state desync issues where dates weren't properly preserving across tab boundaries.
- Repaired "Server Already Initialized" connection issues when hot-reloading the MCP server across multiple client sessions.