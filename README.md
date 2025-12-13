# LLM Orchestrator v2

A Claude-primary LLM orchestrator where **Claude is the single reasoning brain**. Claude can optionally consult advisor models (OpenAI GPT, Google Gemini) for second opinions, but Claude always makes the final decisions.

## Key Concept: Claude as Primary Agent

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude (Primary Agent)                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  MCP Tools   │  │   Advisor    │  │   Advisor    │       │
│  │  (repo ops)  │  │   (OpenAI)   │  │   (Gemini)   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Claude's Final Response                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**This is NOT a multi-agent debate system.** This is sequential delegation where:
- Claude owns the reasoning flow
- Advisors only provide text responses to Claude's questions
- Advisors cannot edit files or run commands
- Claude alone produces the final output

## Features

- **Claude as Primary**: Claude (Anthropic API) is the primary reasoning agent
- **Advisor Tools**: Claude can call `ask_openai` and `ask_gemini` when it wants a second opinion
- **MCP Tools**: Repository operations (search, read, write, patch, run commands)
- **Safe by Default**: File changes require `--apply` (immediate) or `--approve` (confirm each)
- **Budget Guards**: Configurable limits on tool calls and agent turns
- **Claude Decides**: No automatic advisor consultation - Claude chooses when to ask

## Installation

```bash
cd tools/llm-orchestrator
yarn install
yarn build
```

## Environment Variables

```bash
# REQUIRED - Claude is the primary agent
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional - Only needed if you enable advisors
export OPENAI_API_KEY=your-openai-api-key
export GEMINI_API_KEY=your-gemini-api-key
```

## Usage

### Basic Command

```bash
# Ask Claude for help (no advisors)
yarn llm:help --task "explain what this function does"

# Enable OpenAI as an advisor Claude can consult
yarn llm:help --task "review this architecture" --advisors openai

# Enable multiple advisors
yarn llm:help --task "suggest refactoring approach" --advisors openai,gemini
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--task <prompt>` | The task or question for Claude | Required |
| `--advisors <list>` | Comma-separated advisors: `openai,gemini` | `[]` (none) |
| `--apply` | Allow file changes (immediate) | `false` |
| `--approve` | Allow file changes (confirm each) | `false` |
| `--workspace <path>` | Directory where file writes are allowed | Required with `--apply`/`--approve` |
| `--verbose` | Show detailed tool call information | `false` |
| `--cwd <path>` | Working directory for read/search operations | Current directory |
| `--maxToolCalls <n>` | Maximum tool calls allowed | `20` |
| `--maxTurns <n>` | Maximum agent loop turns | `10` |

### Examples

#### 1. Simple Analysis (Claude Only)

```bash
yarn llm:help --task "summarize the current failing tests"
```

Claude analyzes the task independently without consulting any advisors.

#### 2. Architecture Decision with Second Opinion

```bash
yarn llm:help --task "suggest an approach for implementing user authentication" --advisors openai
```

Claude has access to the `ask_openai` tool and may choose to consult GPT for a second opinion on architectural decisions.

#### 3. Complex Refactoring with Multiple Perspectives

```bash
yarn llm:help --task "refactor the payment processing module" --advisors openai,gemini --verbose
```

Claude can consult both OpenAI and Gemini. Use `--verbose` to see which tools Claude used.

#### 4. Implement Changes (Three Modes)

```bash
# Dry-run: see Claude's plan without making changes
yarn llm:help --task "add input validation to the login function"

# Approve mode: review and confirm each file change
yarn llm:help --task "add input validation to the login function" \
  --workspace ./src \
  --approve

# Apply mode: allow immediate file changes
yarn llm:help --task "add input validation to the login function" \
  --workspace ./src \
  --apply
```

**Important**: The `--workspace` flag is required when using `--apply` or `--approve`. This ensures file writes are sandboxed to an explicit directory.

#### 5. Claude Asks GPT for a Second Opinion (Example Flow)

```bash
yarn llm:help --task "review this error handling approach" --advisors openai
```

In this scenario:
1. Claude reads the relevant code
2. Claude decides it wants another perspective
3. Claude calls `ask_openai` with a structured prompt
4. Claude receives GPT's response
5. Claude synthesizes both perspectives into a final recommendation

#### 6. Limit Budget for Cost Control

```bash
# Limit to 5 tool calls and 3 agent turns
yarn llm:help --task "explore this codebase" --maxToolCalls 5 --maxTurns 3
```

### Additional Commands

```bash
# Search repository
yarn llm:help search "TODO"

# Show git diff
yarn llm:help diff

# Run allowed command
yarn llm:help run "yarn test"
```

## Interactive Mode (REPL)

Start an interactive session for multi-turn conversations with Claude:

```bash
# Start interactive session (read-only)
yarn llm:interactive

# Or via dev script
yarn dev interactive

# With write access (requires --workspace)
yarn dev interactive --workspace ./my-project --approve

# With advisors enabled
yarn dev interactive --advisors openai --workspace ./my-project --apply
```

### Interactive Session Example

```
========================================================
  LLM Orchestrator - Interactive Mode
========================================================

Workspace: /Users/you/projects/my-project
Mode: approve
Type !help for commands, !exit to quit

llm> plan a todo list website
Claude is thinking...

Claude:
I'll help you plan a todo list website. Here's the architecture:
1. React frontend with TypeScript
2. Local storage for persistence
...

llm> create the main App component
Claude is thinking...

Claude:
I'll create the App component for you.
[Shows diff]
Apply this change? [y/N]: y
File written: src/App.tsx

llm> !diff
Git diff:
[Shows current uncommitted changes]

llm> !status
Session status:
  Workspace: /Users/you/projects/my-project
  Mode: approve
  Messages: 4
  Duration: 2m 30s

llm> !exit
Goodbye!
```

### Built-in Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `!exit` | `!quit`, `!q` | Exit the interactive session |
| `!help` | `!h`, `!?` | Show available commands |
| `!diff` | `!d` | Show current git diff |
| `!status` | `!s` | Show session status (workspace, mode, message count) |
| `!run <cmd>` | `!r` | Run an allowed command |
| `!clear` | `!c` | Clear conversation history |

### Interactive Mode Options

| Flag | Description | Default |
|------|-------------|---------|
| `--workspace <path>` | Directory where file writes are allowed | None (read-only) |
| `--apply` | Allow file changes (immediate) | `false` |
| `--approve` | Allow file changes (confirm each) | `false` |
| `--advisors <list>` | Comma-separated advisors: `openai,gemini` | `[]` (none) |
| `--verbose` | Show tool call details | `false` |
| `--cwd <path>` | Working directory for reads | Current directory |
| `--maxToolCalls <n>` | Max tool calls per task | `20` |
| `--maxTurns <n>` | Max agent turns per task | `10` |

### What Interactive Mode Is NOT

This is a CLI-first, safe, Claude-primary agent runner. It is **not**:

- An IDE replacement (no editor integration)
- A chat UI (no web interface)
- A persistent agent (no background processes)
- A code indexer (no embeddings or vector DBs)
- Cursor/Copilot (no automatic file watching or edits)

Think of it as: **"gh CLI, but Claude-powered"**

### Session Behavior

- **Ephemeral**: Session exists only while the process runs
- **No persistence**: Conversation history is not saved to disk
- **No background tasks**: All operations are synchronous
- **Explicit writes**: File changes require `--apply` or per-action confirmation
- **Workspace sandboxing**: All writes are contained to `--workspace`

## MCP Server Mode

Run as an MCP server for integration with Claude Code:

```bash
# Start MCP server (read-only)
yarn llm:help mcp

# Start MCP server with write access (requires --workspace)
yarn llm:help mcp --workspace ./my-project --apply
```

## Architecture

```
src/
├── index.ts           # CLI entrypoint
├── router.ts          # LangGraph orchestration (Claude agent loop)
├── interactive.ts     # Interactive REPL mode
├── types.ts           # TypeScript types and schemas
├── config.ts          # Configuration management
├── workspace.ts       # Workspace sandboxing utilities
├── providers/
│   ├── index.ts       # Provider exports
│   ├── claude.ts      # Claude provider (primary agent)
│   ├── openai.ts      # OpenAI provider (for advisor)
│   └── gemini.ts      # Gemini stub
├── advisors/
│   ├── index.ts       # Advisor exports
│   ├── openai.ts      # ask_openai implementation
│   └── gemini.ts      # ask_gemini implementation
└── mcp/
    ├── server.ts      # MCP server implementation
    └── tools/
        ├── repo-search.ts
        ├── read-file.ts
        ├── write-file.ts
        ├── apply-patch.ts
        ├── run-command.ts
        └── git-diff.ts
```

### Orchestration Flow

```
START
  │
  ▼
[Deterministic Context Pack] ─── git diff + keyword search (pre-flight)
  │
  ▼
[Claude Agent] ◄────────────────────────────────┐
  │                                              │
  ├── Use MCP tools (repo_search, read_file)    │
  │                                              │
  ├── Use advisor tools (ask_openai, ask_gemini)│
  │                                              │
  └── Continue reasoning ───────────────────────┘
  │
  ▼
[Budget Check] ─── maxToolCalls / maxTurns limit
  │
  ▼
[Claude Final Output]
  │
  ▼
END
```

**Note on Context Gathering**: Before Claude is invoked, a deterministic "context pack" is gathered automatically:
1. Git diff (if in a git repository)
2. Keyword search based on the first 3 words of your task

This is NOT Claude-driven tool usage. It's a fixed pre-flight step to reduce latency. Claude can still use tools to gather additional context as needed.

### Tools Available to Claude

| Tool | Description | Requires `--apply` or `--approve` | Requires `--advisors` |
|------|-------------|----------------------------------|----------------------|
| `repo_search` | Search for patterns in files | No | No |
| `read_file` | Read file contents | No | No |
| `git_diff` | Get current git diff | No | No |
| `run_command` | Run allowlisted command | No | No |
| `write_file` | Write content to file | Yes | No |
| `apply_patch` | Apply unified diff patch | Yes | No |
| `ask_openai` | Get second opinion from GPT | No | `openai` |
| `ask_gemini` | Get second opinion from Gemini | No | `gemini` |

### Safety Guarantees

1. **Claude owns the flow**: Advisors never make decisions or take actions
2. **Advisors are text-only**: They receive prompts and return text responses
3. **No direct tool access for advisors**: Only Claude can use MCP tools
4. **File writes require explicit flag**: `--apply` (immediate) or `--approve` (confirm)
5. **Workspace sandboxing**: All file writes are restricted to the explicit `--workspace` directory
6. **Command allowlist**: Only safe commands can be executed
7. **Budget guards**: Configurable limits prevent runaway costs

### Workspace vs Process CWD

The tool distinguishes between two directory concepts:

| Concept | Flag | Purpose |
|---------|------|---------|
| **Workspace** | `--workspace` | Where file writes are allowed (write sandbox) |
| **CWD** | `--cwd` | Where read/search operations occur |

**Why this matters**: When running the tool via Yarn with `--cwd`, Yarn changes `process.cwd()` to the tool's installation directory. Without an explicit workspace, file writes would incorrectly go into the tool's directory instead of your intended target.

**Example**:
```bash
# Running from ~/projects
yarn --cwd ~/tools/llm-orchestrator dev \
  --task "create a todo website" \
  --workspace ../../playground/todo-website \
  --apply
```

In this case:
- Yarn's `--cwd` sets the tool's execution context to `~/tools/llm-orchestrator`
- `--workspace ../../playground/todo-website` resolves to `~/playground/todo-website`
- All file writes are sandboxed to `~/playground/todo-website`
- Attempting to write outside the workspace fails with: `Attempted write outside workspace`

**Without `--workspace`**, file writes would go to `~/tools/llm-orchestrator/playground/todo-website`, which is the wrong location.

### Allowed Commands

For safety, only these commands can be executed:
- `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build`
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`
- `git diff`, `git status`, `git log`
- `ls`, `cat`, `head`, `tail`

## Development

```bash
# Run in development mode
yarn dev --task "your task here"

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Type check
yarn typecheck

# Build
yarn build
```

## Migration from v1

If you were using v1 of this tool:

| v1 Flag | v2 Equivalent |
|---------|---------------|
| `--modelPrimary` | Removed (always Claude) |
| `--modelSecondary` | Use `--advisors openai` |
| `--when auto` | Removed (Claude decides) |
| `--when always` | Use `--advisors openai` |
| `--when never` | Don't pass `--advisors` |

## License

MIT
