# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile TypeScript → dist/
pnpm dev              # Run with hot reload (tsx watch)
pnpm test             # Run all tests (watch mode)
pnpm test:coverage    # Run tests with coverage report
pnpm lint             # ESLint check
pnpm lint:fix         # ESLint auto-fix
```

Run a single test file:
```bash
pnpm vitest run src/__tests__/gmail.test.ts
```

Run a single test by name:
```bash
pnpm vitest run --reporter=verbose -t "should get user profile"
```

## Architecture

### Entry & Server

`src/index.ts` → `src/server.ts` (`GoogleWorkspaceMCPServer`) is the single MCP server. It registers all tools in two handlers:
- `ListToolsRequestSchema` — returns tool definitions with Zod-derived JSON schemas
- `CallToolRequestSchema` — dispatches tool name → service method call

Services are lazily initialized in `initializeServices()`, called only after OAuth is confirmed ready via `ensureAuthenticated()`.

### Auth

`src/auth/oauth.ts` exports a singleton `oauth` instance (`GoogleOAuth`). It handles:
- Reading `credentials.json` from platform-specific config dirs (`~/Library/Application Support/google-mcp/` on macOS)
- Storing/refreshing tokens at the same location as `tokens.json`
- Starting a local HTTP callback server on ports 3000–3100 for OAuth redirect

### Services

Each file in `src/services/` wraps one Google API. Services take an `Auth.OAuth2Client` in the constructor and call `googleapis` directly. There is no shared base class.

| File | Google API |
|------|-----------|
| `calendar.ts` | Calendar v3 |
| `gmail.ts` | Gmail v1 |
| `drive.ts` | Drive v3 |
| `docs.ts` | Docs v1 |
| `sheets.ts` | Sheets v4 |
| `slides.ts` | Slides v1 |
| `forms.ts` | Forms v1 |
| `chat.ts` | Chat v1 |
| `meet.ts` | Meet v2 |
| `people.ts` | People v1 (Contacts) |
| `tasks.ts` | Tasks v1 |
| `youtube.ts` | YouTube Data v3 |

### Types / Zod Schemas

`src/types/index.ts` defines Zod schemas used for input validation in tool handlers. New schemas go here and are imported into `server.ts`.

### Adding a New Tool

1. Add the method to the relevant service in `src/services/`
2. If the tool needs input params beyond primitives, add a Zod schema to `src/types/index.ts`
3. Register the tool in `server.ts`: add it to the `ListToolsRequestSchema` handler and add a `case` in the `CallToolRequestSchema` switch
4. Add test coverage in `src/__tests__/<service>.test.ts`

## Testing

Tests use **vitest** and mock `googleapis` at the module level. The mock must be declared before the service import because vitest hoists `vi.mock()` calls.

Pattern for each test file:
```ts
const mockSomeMethod = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    serviceName: () => ({ resource: { method: mockSomeMethod } }),
  },
}));

import { MyService } from "../services/my-service.js";
```

`src/server.ts` is intentionally excluded from coverage — it's considered e2e integration territory. Coverage thresholds: statements 80%, branches 65%, functions 85%, lines 80%.

## Testing

Always write tests when adding new functionality. New MCP tools, service methods, or handler branches must include corresponding test cases in `src/__tests__/` in the same commit.
