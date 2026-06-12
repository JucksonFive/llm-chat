# MCP Server Import Guide

This guide explains how to import custom MCP (Model Context Protocol) servers into the application, including diagram tools, drawing tools, and other specialized integrations.

## Overview

You can now import MCP servers in three ways:
1. **Browse Presets** - Install from curated preset library
2. **Import from File** - Upload a JSON configuration file
3. **Import from URL** - Fetch a configuration from a URL

## Accessing the Import UI

1. Open **Settings** (gear icon)
2. Click the **MCP** tab
3. Click the **Import** dropdown button
4. Choose your import method

## Import Methods

### 1. Import from File

**Use Case:** Share MCP configurations with colleagues, install tools from downloaded configs

**Steps:**
1. Select "Import from File" from the Import dropdown
2. Drag and drop a `.json` file, or click "Select File"
3. Preview the configuration
4. Click "Test Connection" (optional)
5. Click "Install"

**Example Files:**
- `test-mcp-import.json` - Single Mermaid diagram server
- `test-mcp-import-multi.json` - Multiple diagram/visualization servers

### 2. Import from URL

**Use Case:** Install MCP servers shared via GitHub, documentation, or community forums

**Steps:**
1. Select "Import from URL" from the Import dropdown
2. Paste the URL to a JSON configuration file
3. Click "Fetch"
4. Preview the configuration
5. Click "Install"

**Example URLs:**
```
https://raw.githubusercontent.com/user/repo/main/mcp-config.json
https://example.com/mcp-servers/diagram-tools.json
```

### 3. Browse Presets

**Use Case:** Install from the built-in preset library

**Steps:**
1. Select "Browse Presets" from the Import dropdown
2. Browse by category (filesystem, search, diagrams, etc.)
3. Click "Install" on the desired preset
4. Fill in any required environment variables (API keys)
5. Click "Confirm Install"

## JSON Configuration Format

### Single Server

```json
{
  "name": "Mermaid Diagrams",
  "description": "Generate flowcharts, sequence diagrams, and more",
  "category": "diagrams",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-mermaid"],
  "homepage": "https://mermaid.js.org"
}
```

### Multiple Servers (Array)

```json
[
  {
    "name": "Server 1",
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "package-name"]
  },
  {
    "name": "Server 2",
    "transport": "sse",
    "url": "https://example.com/mcp"
  }
]
```

## Configuration Fields

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name for the server |
| `transport` | string | One of: `stdio`, `sse`, `streamable-http` |

### Transport-Specific Requirements

**For `stdio` transport:**
- `command` (required) - Command to execute (e.g., `npx`, `node`)
- `args` (optional) - Array of command arguments
- `env` (optional) - Environment variables

**For `sse` or `streamable-http` transport:**
- `url` (required) - Server URL (prefer HTTPS)

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Human-readable description |
| `category` | string | One of: filesystem, search, database, developer, productivity, diagrams, drawing, visualization, ai-tools, communication |
| `env` | object | Environment variables (key-value pairs) |
| `envPlaceholders` | array | Prompts for user input (API keys, tokens) |
| `homepage` | string | Documentation URL |

### Environment Variable Placeholders

If your MCP server requires API keys or credentials, use `envPlaceholders`:

```json
{
  "name": "API-based Tool",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "mcp-api-tool"],
  "envPlaceholders": [
    {
      "key": "API_KEY",
      "label": "API Key",
      "description": "Your API key from example.com/settings",
      "required": true
    }
  ]
}
```

The user will be prompted to enter these values during installation.

## Categories

Servers are organized by category in the preset browser:

- **filesystem** - File operations
- **search** - Web/data search
- **database** - Database access
- **developer** - Dev tools
- **productivity** - Productivity tools
- **diagrams** - Diagram generation (NEW)
- **drawing** - Drawing tools (NEW)
- **visualization** - Data visualization (NEW)
- **ai-tools** - AI integrations (NEW)
- **communication** - Chat/messaging (NEW)

## Validation

The import system validates configurations before installation:

**Errors (prevent installation):**
- Missing required fields (name, transport)
- Invalid transport type
- stdio without command
- sse/streamable-http without URL

**Warnings (allow installation):**
- HTTP URLs (recommend HTTPS)
- Unused fields for transport type

## Testing Connections

Before installing, you can test if the server works:

1. Click "Test Connection" in the preview
2. Wait for the connection test
3. View discovered tools, resources, and prompts
4. Install even if test fails (useful for local development)

## Examples

### Diagram Tools

**Mermaid:**
```json
{
  "name": "Mermaid Diagrams",
  "category": "diagrams",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-mermaid"]
}
```

**PlantUML:**
```json
{
  "name": "PlantUML",
  "category": "diagrams",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-plantuml"]
}
```

### Remote Servers

**SSE:**
```json
{
  "name": "Remote Diagram Service",
  "transport": "sse",
  "url": "https://diagrams.example.com/sse"
}
```

**Streamable HTTP:**
```json
{
  "name": "HTTP API Server",
  "transport": "streamable-http",
  "url": "https://api.example.com/mcp"
}
```

## Troubleshooting

### Import Fails

**"Invalid JSON"**
- Check JSON syntax with a validator
- Ensure proper quotes and commas

**"Missing required fields"**
- Verify `name` and `transport` are present
- For stdio: add `command`
- For sse/streamable-http: add `url`

### Test Connection Fails

**"Connection failed"**
- For stdio: ensure package is published to npm
- For remote: check URL is accessible
- Check environment variables are correct

**"Tool not found"**
- Verify command/URL is correct
- Check MCP server is running (for remote)

### Installation Issues

**"Failed to install"**
- Check server logs in the console
- Verify no duplicate server names
- Try manual configuration if import fails

## Sharing Configurations

To share an MCP server configuration:

1. Create a JSON file following the format above
2. Host it on:
   - GitHub (use raw.githubusercontent.com URL)
   - Your website (HTTPS recommended)
   - Share file directly with colleagues

3. Recipients can import via URL or file

## Security Considerations

- **HTTPS URLs**: Always prefer HTTPS for remote servers
- **Environment Variables**: Never commit API keys to JSON files
- **stdio Commands**: Verify source before running unknown npm packages
- **Test First**: Use "Test Connection" before installation

## Next Steps

After importing MCP servers:

1. Go to **Agents** settings
2. Edit or create an agent
3. In **MCP Tools** section, enable imported servers
4. Use the agent - it will have access to the MCP tools

## Support

For issues or questions:
- Check the server's homepage/documentation
- Review validation errors carefully
- Test connection to diagnose issues
- Fall back to manual configuration if needed
