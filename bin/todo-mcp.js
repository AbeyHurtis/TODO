#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const distServerPath = path.join(__dirname, '..', 'dist', 'stdioServer.js');
const distPath = path.join(__dirname, '..', 'dist', 'stdio.js');
const outPath = path.join(__dirname, '..', 'out', 'stdioServer.js');

if (fs.existsSync(distServerPath)) {
    require(distServerPath);
} else if (fs.existsSync(distPath)) {
    require(distPath);
} else if (fs.existsSync(outPath)) {
    const mod = require(outPath);
    if (mod && typeof mod.runStdioServer === 'function') {
        mod.runStdioServer();
    }
} else {
    console.error('TODO MCP server bundle not found. Please run "npm run compile" first.');
    process.exit(1);
}
