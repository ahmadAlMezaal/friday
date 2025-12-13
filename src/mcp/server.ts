import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  repoSearch,
  readFile,
  writeFile,
  applyPatch,
  runCommand,
  gitDiff,
} from './tools/index.js';

export interface MCPServerOptions {
  cwd: string;
  allowWrite: boolean;
}

export function createMCPServer(options: MCPServerOptions): Server {
  const server = new Server(
    {
      name: 'llm-orchestrator',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'repo_search',
          description: 'Search for text patterns in repository files',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'read_file',
          description: 'Read the contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file (relative to cwd)',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write content to a file (requires --apply flag)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file (relative to cwd)',
              },
              content: {
                type: 'string',
                description: 'Content to write',
              },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'apply_patch',
          description: 'Apply a unified diff patch to a file (requires --apply flag)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file (relative to cwd)',
              },
              unifiedDiff: {
                type: 'string',
                description: 'The unified diff to apply',
              },
            },
            required: ['path', 'unifiedDiff'],
          },
        },
        {
          name: 'run_command',
          description: 'Run a safe, allowlisted command (yarn test, git diff, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              cmd: {
                type: 'string',
                description: 'The command to run',
              },
            },
            required: ['cmd'],
          },
        },
        {
          name: 'git_diff',
          description: 'Get the current git diff (staged and unstaged changes)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'repo_search': {
          const result = await repoSearch(args?.query as string, { cwd: options.cwd });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'read_file': {
          const result = await readFile(args?.path as string, { cwd: options.cwd });
          return { content: [{ type: 'text', text: result.content }] };
        }

        case 'write_file': {
          const result = await writeFile(
            args?.path as string,
            args?.content as string,
            { cwd: options.cwd, allowWrite: options.allowWrite }
          );
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'apply_patch': {
          const result = await applyPatch(
            args?.path as string,
            args?.unifiedDiff as string,
            { cwd: options.cwd, allowWrite: options.allowWrite }
          );
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }

        case 'run_command': {
          const result = await runCommand(args?.cmd as string, { cwd: options.cwd });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'git_diff': {
          const result = await gitDiff({ cwd: options.cwd });
          return { content: [{ type: 'text', text: result.diff }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// Standalone MCP server runner (can be used independently)
export async function runMCPServer(options: MCPServerOptions): Promise<void> {
  const server = createMCPServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
