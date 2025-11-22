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
  {
    name: "wait_for",
    description: "Wait for an element to appear on the page.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to wait for",
        },
        timeout: {
          type: "number",
          description: "Maximum time to wait in milliseconds. Defaults to 30000.",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "scroll",
    description: "Scroll the page in a specified direction or to a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "top", "bottom"],
          description: "Direction to scroll: up, down, top, or bottom",
        },
        selector: {
          type: "string",
          description: "CSS selector of element to scroll into view. If provided, direction is ignored.",
        },
      },
    },
  },
  {
    name: "evaluate",
    description: "Execute custom JavaScript code in the browser context and return the result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "JavaScript code to execute. Use 'return' to return a value.",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "go_back",
    description: "Navigate back in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "go_forward",
    description: "Navigate forward in browser history.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_html",
    description: "Get the HTML content of the page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector. If not provided, returns full page HTML.",
        },
        outer: {
          type: "boolean",
          description: "If true, includes the element's own tag. Defaults to true.",
        },
      },
    },
  },
  {
    name: "select_option",
    description: "Select an option from a dropdown/select element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the select element",
        },
        value: {
          type: "string",
          description: "The value or label of the option to select",
        },
      },
      required: ["selector", "value"],
    },
  },
  {
    name: "hover",
    description: "Hover over an element specified by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the element to hover over",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "get_links",
    description: "Extract all links from the page or a specific element.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "Optional CSS selector to limit link extraction to a specific area.",
        },
      },
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

      case "wait_for": {
        const { selector, timeout } = args as { selector: string; timeout?: number };
        const currentPage = await getPage();

        await currentPage.waitForSelector(selector, { timeout: timeout ?? 30000 });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Element found: ${selector}`,
              }, null, 2),
            },
          ],
        };
      }

      case "scroll": {
        const { direction, selector } = args as { direction?: string; selector?: string };
        const currentPage = await getPage();

        if (selector) {
          await currentPage.locator(selector).scrollIntoViewIfNeeded();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: `Scrolled to element: ${selector}`,
                }, null, 2),
              },
            ],
          };
        }

        switch (direction) {
          case "top":
            await currentPage.evaluate(() => window.scrollTo(0, 0));
            break;
          case "bottom":
            await currentPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            break;
          case "up":
            await currentPage.evaluate(() => window.scrollBy(0, -500));
            break;
          case "down":
          default:
            await currentPage.evaluate(() => window.scrollBy(0, 500));
            break;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Scrolled ${direction ?? "down"}`,
              }, null, 2),
            },
          ],
        };
      }

      case "evaluate": {
        const { script } = args as { script: string };
        const currentPage = await getPage();

        const result = await currentPage.evaluate((code) => {
          return eval(code);
        }, script);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                result: result,
              }, null, 2),
            },
          ],
        };
      }

      case "go_back": {
        const currentPage = await getPage();
        await currentPage.goBack();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Navigated back",
                url: currentPage.url(),
              }, null, 2),
            },
          ],
        };
      }

      case "go_forward": {
        const currentPage = await getPage();
        await currentPage.goForward();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Navigated forward",
                url: currentPage.url(),
              }, null, 2),
            },
          ],
        };
      }

      case "get_html": {
        const { selector, outer } = args as { selector?: string; outer?: boolean };
        const currentPage = await getPage();

        let html: string;

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
          html = outer !== false
            ? await element.evaluate((el) => el.outerHTML)
            : await element.evaluate((el) => el.innerHTML);
        } else {
          html = await currentPage.content();
        }

        return {
          content: [
            {
              type: "text",
              text: html,
            },
          ],
        };
      }

      case "select_option": {
        const { selector, value } = args as { selector: string; value: string };
        const currentPage = await getPage();

        await currentPage.selectOption(selector, value);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Selected "${value}" in ${selector}`,
              }, null, 2),
            },
          ],
        };
      }

      case "hover": {
        const { selector } = args as { selector: string };
        const currentPage = await getPage();

        await currentPage.hover(selector);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `Hovered over: ${selector}`,
              }, null, 2),
            },
          ],
        };
      }

      case "get_links": {
        const { selector } = args as { selector?: string };
        const currentPage = await getPage();

        const container = selector || "body";
        const links = await currentPage.$$eval(`${container} a[href]`, (anchors) =>
          anchors.map((a) => ({
            text: a.textContent?.trim() || "",
            href: a.getAttribute("href") || "",
          }))
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: links.length,
                links: links,
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
