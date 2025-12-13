# LLM Orchestrator

A multi-LLM helper orchestrator where Claude is the primary model (used via Claude Code), with the ability to consult secondary LLMs (OpenAI/GPT-4, optionally Gemini) for second opinions, alternative solutions, and debugging help.

## Features

- **Multi-LLM Orchestration**: Primary analysis with optional secondary opinions
- **Smart Auto-Consultation**: Automatically consults secondary LLM when:
  - Primary response indicates uncertainty ("not sure", "might", "unclear")
  - Task involves non-trivial refactoring or architecture decisions
  - Tests are failing or errors are detected
- **MCP Server**: Exposes tools for repo operations (search, read, write, patch, run commands)
- **Safe by Default**: File changes only with explicit `--apply` flag
- **Allowlisted Commands**: Only safe commands can be executed

## Installation

```bash
cd tools/llm-orchestrator
yarn install
yarn build
```

## Environment Variables

```bash
# Required for secondary model (OpenAI)
export OPENAI_API_KEY=your-openai-api-key

# Optional (for future Gemini support)
export GEMINI_API_KEY=your-gemini-api-key
```

## Usage

### Basic Command

```bash
# Ask for help with a task
yarn llm:help --task "explain what this function does"

# Or using node directly
node dist/index.js --task "summarize the failing tests"
```

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--task <prompt>` | The task or question to analyze | Required |
| `--modelPrimary <model>` | Primary model (conceptual) | `claude` |
| `--modelSecondary <model>` | Secondary model | `openai:gpt-4.1` |
| `--when <mode>` | When to consult secondary: `auto\|always\|never` | `auto` |
| `--apply` | Allow file changes | `false` |
| `--dry-run` | Dry run mode | `true` |
| `--cwd <path>` | Working directory | Current directory |

### Examples

#### 1. Summarize Current Failing Tests

```bash
yarn llm:help --task "summarize the current failing tests and suggest fixes"
```

This will:
1. Gather context from the repository (search for test files, get git diff)
2. Primary LLM analyzes the situation
3. If uncertainty detected or tests are failing, consult secondary LLM
4. Merge and present recommendations

#### 2. Suggest Approach for Feature

```bash
yarn llm:help --task "suggest an approach for implementing user authentication" --when always
```

Using `--when always` ensures the secondary LLM is always consulted for architectural decisions.

#### 3. Implement a Small Change

```bash
# First, dry-run to see what would be changed
yarn llm:help --task "add input validation to the login function"

# If you approve, run with --apply to make changes
yarn llm:help --task "add input validation to the login function" --apply
```

#### 4. Get Secondary Opinion Only When Uncertain

```bash
yarn llm:help --task "fix the bug in the payment processing" --when auto
```

With `--when auto` (default), secondary is consulted only if:
- Primary response contains uncertainty ("not sure", "might", etc.)
- Task involves refactoring/architecture
- Error patterns detected in context

#### 5. Primary Only (No Secondary)

```bash
yarn llm:help --task "add a console.log for debugging" --when never
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

## MCP Server Mode

Run as an MCP server for integration with Claude Code:

```bash
# Start MCP server (read-only)
yarn llm:help mcp

# Start MCP server with write access
yarn llm:help mcp --apply
```

### MCP Tools Available

| Tool | Description | Requires `--apply` |
|------|-------------|-------------------|
| `repo_search` | Search for patterns in files | No |
| `read_file` | Read file contents | No |
| `write_file` | Write content to file | Yes |
| `apply_patch` | Apply unified diff patch | Yes |
| `run_command` | Run allowlisted command | No |
| `git_diff` | Get current git diff | No |

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

## Architecture

```
src/
├── index.ts           # CLI entrypoint
├── router.ts          # LangGraph orchestration logic
├── types.ts           # TypeScript types and schemas
├── config.ts          # Configuration management
├── providers/
│   ├── index.ts       # Provider factory
│   ├── openai.ts      # OpenAI provider
│   └── gemini.ts      # Gemini stub (future)
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

### Orchestration Flow (LangGraph)

```
START
  │
  ▼
[Gather Context] ─── Search repo, get git diff
  │
  ▼
[Primary Analysis] ─── Analyze task with context
  │
  ▼
{Should call secondary?}
  │
  ├── YES ──► [Secondary Analysis] ─── Get second opinion
  │                    │
  │                    ▼
  │            [Merge Responses]
  │                    │
  └── NO ─────────────►│
                       │
                       ▼
                     [Output]
                       │
                       ▼
                      END
```

### Decision Logic for Auto-Consultation

The router decides to consult the secondary LLM when `--when=auto` and ANY of:

1. **Uncertainty detected** in primary response:
   - "not sure", "might be", "could be", "unclear", "uncertain"
   - "possibly", "perhaps", "I think", "probably", "may need"

2. **Complex task** indicated by keywords:
   - "refactor", "architecture", "redesign", "restructure"
   - "migrate", "breaking change", "significant change"

3. **Errors detected** in context:
   - "error", "fail", "exception", "test.*fail", "broken"

## License

MIT
