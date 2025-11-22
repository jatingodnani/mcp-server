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
  {
    name: "screenshot",
    description: "Take a screenshot of the current page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to screenshot a specific element. If not provided, captures the full page.",
        },
        fullPage: {
          type: "boolean",
          description: "Whether to capture the full scrollable page. Defaults to false.",
        },
      },
    },
  },
  {
    name: "extract_text",
    description: "Extract text content from the page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to extract text from. If not provided, extracts all visible text from the page.",
        },
      },
    },
  },
  {
    name: "click",
    description: "Click on an element specified by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to click",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "type",
    description: "Type text into an input field specified by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the input element",
        },
        text: {
          type: "string",
          description: "The text to type into the element",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "get_page_info",
    description: "Get information about the current page including URL, title, and meta description.",
    inputSchema: {
      type: "object",
      properties: {},
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

      case "screenshot": {
        const { selector, fullPage } = args as { selector?: string; fullPage?: boolean };
        const currentPage = await getPage();

        let screenshotBuffer: Buffer;

        if (selector) {
          const element = await currentPage.$(selector);
          if (!element) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Element not found: ${selector}`,
                },
              ],
              isError: true,
            };
          }
          screenshotBuffer = await element.screenshot();
        } else {
          screenshotBuffer = await currentPage.screenshot({ fullPage: fullPage ?? false });
        }

        const base64Image = screenshotBuffer.toString("base64");

        return {
          content: [
            {
              type: "image",
              data: base64Image,
              mimeType: "image/png",
            },
          ],
        };
      }

      case "extract_text": {
        const { selector } = args as { selector?: string };
        const currentPage = await getPage();

        let text: string;

        if (selector) {
          const element = await currentPage.$(selector);
          if (!element) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Element not found: ${selector}`,
                },
              ],
              isError: true,
            };
          }
          text = await element.innerText();
        } else {
          text = await currentPage.innerText("body");
        }

        return {
          content: [
            {
              type: "text",
              text: text,
            },
          ],
        };
      }

      case "click": {
        const { selector } = args as { selector: string };
        const currentPage = await getPage();

        await currentPage.click(selector);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Clicked element: ${selector}`,
              }, null, 2),
            },
          ],
        };
      }

      case "type": {
        const { selector, text } = args as { selector: string; text: string };
        const currentPage = await getPage();

        await currentPage.fill(selector, text);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Typed text into: ${selector}`,
              }, null, 2),
            },
          ],
        };
      }

      case "get_page_info": {
        const currentPage = await getPage();

        const url = currentPage.url();
        const title = await currentPage.title();
        const description = await currentPage.$eval(
          'meta[name="description"]',
          (el) => el.getAttribute("content")
        ).catch(() => null);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url,
                title,
                description,
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
