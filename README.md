# Friday

A Claude-primary agent for software engineering tasks. **Claude is the single reasoning brain**. Claude can optionally consult advisor models (OpenAI GPT, Google Gemini) for second opinions, but Claude always makes the final decisions.

Think of it as: **"gh CLI, but Claude-powered"**

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

### Local Install (npm link)

```bash
cd tools/llm-orchestrator
yarn install
yarn build
npm link
```

Now you can run `friday` from anywhere:

```bash
friday
```

### Uninstall

```bash
npm unlink -g friday-cli
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

### Quick Start

```bash
# Start interactive mode (default)
friday

# With file write access
friday --workspace ./my-project --approve
```

### One-Shot Mode

```bash
# Ask Claude for help (no advisors)
friday ask --task "explain what this function does"

# Enable OpenAI as an advisor Claude can consult
friday ask --task "review this architecture" --advisors openai

# Enable multiple advisors
friday ask --task "suggest refactoring approach" --advisors openai,gemini
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
friday ask --task "summarize the current failing tests"
```

Claude analyzes the task independently without consulting any advisors.

#### 2. Architecture Decision with Second Opinion

```bash
friday ask --task "suggest an approach for implementing user authentication" --advisors openai
```

Claude has access to the `ask_openai` tool and may choose to consult GPT for a second opinion on architectural decisions.

#### 3. Complex Refactoring with Multiple Perspectives

```bash
friday ask --task "refactor the payment processing module" --advisors openai,gemini --verbose
```

Claude can consult both OpenAI and Gemini. Use `--verbose` to see which tools Claude used.

#### 4. Implement Changes (Three Modes)

```bash
# Dry-run: see Claude's plan without making changes
friday ask --task "add input validation to the login function"

# Approve mode: review and confirm each file change
friday ask --task "add input validation to the login function" \
  --workspace ./src \
  --approve

# Apply mode: allow immediate file changes
friday ask --task "add input validation to the login function" \
  --workspace ./src \
  --apply
```

**Important**: The `--workspace` flag is required when using `--apply` or `--approve`. This ensures file writes are sandboxed to an explicit directory.

#### 5. Claude Asks GPT for a Second Opinion (Example Flow)

```bash
friday ask --task "review this error handling approach" --advisors openai
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
friday ask --task "explore this codebase" --maxToolCalls 5 --maxTurns 3
```

### Additional Commands

```bash
# Search repository
friday search "TODO"

# Show git diff
friday diff

# Run allowed command
friday run "yarn test"
```

## Interactive Mode (REPL)

Interactive mode is the **default** when you run `friday` without arguments:

```bash
# Start interactive session (read-only by default)
friday

# With write access (requires --workspace)
friday --workspace ./my-project --approve

# With advisors enabled
friday --advisors openai --workspace ./my-project --apply

# Or explicitly
friday interactive
```

### Session Control Commands

Friday supports a smooth workflow where you can start in dry-run mode, request a plan, then enable writes — all within the same session:

```bash
# Start in safe mode (default)
friday

# Later, set workspace and enable writes from within the REPL
friday> !workspace ./my-project
✓ Workspace set to: ./my-project

friday> !approve
✓ Mode changed to: approve
```

### Example: Plan-First Workflow

```
friday> !plan
• Plan mode enabled for next task. Claude will provide a plan without writing files.

friday> add user authentication to the app
[Claude provides a detailed plan without writing files]

→ Proceed to implementation? (y/N): y
✓ Mode changed to: approve
• You can now ask Claude to implement the plan.

friday> implement the plan
[Claude writes files, showing each change for approval]

   ✍ wrote: src/auth/login.tsx
   ✍ wrote: src/auth/hooks.ts
```

### Interactive Session Example

```
   ╭──────────────────────────────────────────╮
   │  ✦  F R I D A Y  ✦                       │
   │       Claude-primary Agent               │
   ╰──────────────────────────────────────────╯

   Workspace   (read-only)
   Mode        dry-run
   Advisors    none

   Type your task, or !help for commands.

❯ friday › !workspace ./my-project
✓ Workspace set to: ~/my-project

❯ friday › !plan
• Plan mode enabled for next task. Claude will provide a plan without writing files.

❯ friday › build a todo list website
   ◌ Gathering context...
   ⚙ Claude is searching the repository...

┌ Claude ────────────────────────────────────────
I'll plan a todo list website for you. Here's the architecture:

1. **Components**
   - `App.tsx` - Main application component
   - `TodoList.tsx` - List container
   - `TodoItem.tsx` - Individual todo item

2. **State Management**
   - Use React useState for local state
   - Local storage for persistence

3. **Features**
   - Add/remove todos
   - Mark as complete
   - Filter by status
└────────────────────────────────────────────────

→ Proceed to implementation? (y/N): y
✓ Mode changed to: approve
• You can now ask Claude to implement the plan.

❯ friday › implement the plan
   ◌ Gathering context...
   ⚙ Claude is writing a file...

[Shows diff]
Apply this change? [y/N]: y
   ✍ wrote: src/App.tsx

[Shows diff]
Apply this change? [y/N]: y
   ✍ wrote: src/TodoList.tsx

┌ Claude ────────────────────────────────────────
I've created the todo list website with the following files:
- src/App.tsx - Main app with state management
- src/TodoList.tsx - List component with filtering
- src/TodoItem.tsx - Individual todo with toggle
└────────────────────────────────────────────────

❯ friday › !status
Session status:
  Workspace  ~/my-project
  CWD        ~/my-project
  Mode       approve
  Advisors   none
  Messages   4
  Duration   3m 45s

❯ friday › !exit
• Goodbye!
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

### Session Control Commands

| Command | Description |
|---------|-------------|
| `!workspace <path>` | Set/change workspace directory (resolves relative to launch dir) |
| `!mode <mode>` | Set write mode: `dry-run`, `approve`, or `apply` |
| `!dry` | Shortcut for `!mode dry-run` |
| `!approve` | Shortcut for `!mode approve` (requires workspace) |
| `!apply` | Shortcut for `!mode apply` (requires workspace) |
| `!plan` | Toggle plan-only mode for the next task |

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

### What Friday Is NOT

Friday is a CLI-first, safe, Claude-primary agent runner. It is **not**:

- An IDE replacement (no editor integration)
- A chat UI (no web interface)
- A persistent agent (no background processes)
- A code indexer (no embeddings or vector DBs)
- Cursor/Copilot (no automatic file watching or edits)

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
friday mcp

# Start MCP server with write access (requires --workspace)
friday mcp --workspace ./my-project --apply
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

**Why this matters**: The workspace flag ensures file writes go to the correct location relative to where you invoked the command.

**Example**:
```bash
# Running from ~/projects
friday ask --task "create a todo website" \
  --workspace ./playground/todo-website \
  --apply
```

In this case:
- `--workspace ./playground/todo-website` resolves to `~/projects/playground/todo-website`
- All file writes are sandboxed to that directory
- Attempting to write outside the workspace fails with: `Attempted write outside workspace`

### Allowed Commands

For safety, only these commands can be executed:
- `yarn test`, `yarn lint`, `yarn typecheck`, `yarn build`
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`
- `git diff`, `git status`, `git log`
- `ls`, `cat`, `head`, `tail`

## Development

```bash
# Run in development mode (interactive)
yarn dev

# Run one-shot mode in dev
yarn dev ask --task "your task here"

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Type check
yarn typecheck

# Build
yarn build

# Run built version
yarn friday
```

## License

MIT
