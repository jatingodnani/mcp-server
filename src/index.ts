import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page } from "playwright";

// Browser instance (will be initialized on first use)
let browser: Browser | null = null;
let page: Page | null = null;

// Initialize browser
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
  }
  return browser;
}

// Get or create page
async function getPage(): Promise<Page> {
  if (!page) {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();
  }
  return page;
}

// Cleanup browser on exit
async function cleanup() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

// Create MCP server
const server = new Server(
  {
    name: "web-automation-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: "navigate",
    description: "Navigate to a URL in the browser. Returns the page title and final URL after any redirects.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (must include protocol, e.g., https://)",
        },
      },
      required: ["url"],
    },
  },
];

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "navigate": {
        const url = (args as { url: string }).url;

        // Validate URL
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          return {
            content: [
              {
                type: "text",
                text: "Error: URL must start with http:// or https://",
              },
            ],
            isError: true,
          };
        }

        const currentPage = await getPage();
        await currentPage.goto(url, { waitUntil: "domcontentloaded" });

        const title = await currentPage.title();
        const finalUrl = currentPage.url();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                title,
                url: finalUrl,
              }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Web Automation MCP server started");
}

// Handle shutdown
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
