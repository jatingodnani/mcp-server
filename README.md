# Web Automation MCP Server

A Model Context Protocol (MCP) server that provides browser automation capabilities for AI agents using Playwright.

## Features

- **15 automation tools** for complete browser control
- **Headless browser** operation for efficiency
- **Screenshot capture** with element targeting
- **Form automation** with input filling and selection
- **DOM extraction** for text, HTML, and links
- **Custom JavaScript execution** for advanced scenarios

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Build the project
npm run build
```

## Usage

### Start the server

```bash
npm start
```

### Configure with Claude Code

Add to your MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "web-automation": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

## Available Tools

### Navigation

| Tool | Description | Parameters |
|------|-------------|------------|
| `navigate` | Go to a URL | `url` (required) |
| `go_back` | Navigate back in history | none |
| `go_forward` | Navigate forward in history | none |

### Data Extraction

| Tool | Description | Parameters |
|------|-------------|------------|
| `extract_text` | Get text from page/element | `selector` (optional) |
| `get_html` | Get HTML content | `selector` (optional), `outer` (boolean) |
| `get_links` | Extract all links | `selector` (optional) |
| `get_page_info` | Get URL, title, description | none |

### Interaction

| Tool | Description | Parameters |
|------|-------------|------------|
| `click` | Click an element | `selector` (required) |
| `type` | Type text into input | `selector` (required), `text` (required) |
| `select_option` | Select dropdown option | `selector` (required), `value` (required) |
| `hover` | Hover over element | `selector` (required) |

### Visual

| Tool | Description | Parameters |
|------|-------------|------------|
| `screenshot` | Capture page/element | `selector` (optional), `fullPage` (boolean) |

### Utilities

| Tool | Description | Parameters |
|------|-------------|------------|
| `wait_for` | Wait for element | `selector` (required), `timeout` (ms) |
| `scroll` | Scroll the page | `direction` or `selector` |
| `evaluate` | Run custom JavaScript | `script` (required) |

## Example Usage

### Basic navigation and screenshot

```
User: "Go to https://news.ycombinator.com and take a screenshot"

AI will call:
1. navigate({ url: "https://news.ycombinator.com" })
2. screenshot({ fullPage: true })
```

### Extract data

```
User: "Get all the links from the page"

AI will call:
1. get_links()
```

### Form automation

```
User: "Search for 'AI news' on the page"

AI will call:
1. type({ selector: "input[type='search']", text: "AI news" })
2. click({ selector: "button[type='submit']" })
```

### Custom JavaScript

```
User: "Get the number of images on the page"

AI will call:
1. evaluate({ script: "return document.images.length" })
```

## Development

```bash
# Build
npm run build

# Run in development
npm run dev
```

## Architecture

```
┌─────────────────────────────────────┐
│         MCP Client (Claude)         │
└──────────────┬──────────────────────┘
               │ JSON-RPC / stdio
┌──────────────▼──────────────────────┐
│     Web Automation MCP Server       │
│  ┌─────────────────────────────┐    │
│  │   15 Tool Definitions       │    │
│  └─────────────┬───────────────┘    │
│  ┌─────────────▼───────────────┐    │
│  │   Playwright Browser        │    │
│  │   (Chromium, headless)      │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

## Limitations

- Some websites with bot protection (Cloudflare, CAPTCHA) may block automation
- Always respect website Terms of Service
- Check robots.txt before scraping
- Use official APIs when available

## License

MIT
