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
- **Safe by Default**: File changes only with explicit `--apply` flag
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
| `--apply` | Allow file changes | `false` |
| `--verbose` | Show detailed tool call information | `false` |
| `--cwd <path>` | Working directory | Current directory |

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

#### 4. Implement Changes

```bash
# First, dry-run to see Claude's plan
yarn llm:help --task "add input validation to the login function"

# If you approve, run with --apply to allow file changes
yarn llm:help --task "add input validation to the login function" --apply
```

#### 5. Claude Asks GPT for a Second Opinion (Example Flow)

```bash
yarn llm:help --task "review this error handling approach" --advisors openai
```

In this scenario:
1. Claude reads the relevant code
2. Claude decides it wants another perspective
3. Claude calls `ask_openai("What do you think of this error handling pattern?")`
4. Claude receives GPT's response
5. Claude synthesizes both perspectives into a final recommendation

### Additional Commands

```bash
# Search repository
yarn llm:help search "TODO"

# Show git diff
yarn llm:help diff

# Run allowed command
yarn llm:help run "yarn test"
```

## MCP Server Mode

Run as an MCP server for integration with Claude Code:

```bash
# Start MCP server (read-only)
yarn llm:help mcp

# Start MCP server with write access
yarn llm:help mcp --apply
```

## Architecture

```
src/
├── index.ts           # CLI entrypoint
├── router.ts          # LangGraph orchestration (Claude agent loop)
├── types.ts           # TypeScript types and schemas
├── config.ts          # Configuration management
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
[Gather Context] ─── Get git diff, search for relevant files
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
[Claude Final Output]
  │
  ▼
END
```

### Tools Available to Claude

| Tool | Description | Requires `--apply` | Requires `--advisors` |
|------|-------------|-------------------|----------------------|
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
4. **File writes require `--apply`**: Safe by default
5. **Command allowlist**: Only safe commands can be executed

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
