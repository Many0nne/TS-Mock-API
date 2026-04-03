# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with nodemon + tsx (interactive wizard)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled server (dist/index.js)
npm test             # Run all tests with Jest
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run clean        # Remove dist/
```

Run a single test file:
```bash
npm test -- constraintExtractor.test.ts
npm test -- --testPathPattern=pluralize
```

TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, etc.). Tests live in `tests/` and are excluded from `tsconfig.json`.

## Architecture

**Entry point**: `src/index.ts` — parses CLI args via Commander; if no args, runs the interactive `src/cli/wizard.ts`. Both paths call `startServer(config)`.

**Mock modes** (`mockMode: 'dev' | 'strict'`, default `'dev'`):
- `dev`: `statusOverride` and `latency` middlewares are mounted
- `strict`: those middlewares are not mounted at all — clean REST simulation
- Resolution order: CLI `--mock-mode` > `MOCK_API_MODE` env var > config file > default (`'dev'`)

**Request lifecycle** (`src/server.ts` → `src/core/router.ts`):
1. Express middleware chain: CORS → JSON → logger → `statusOverride` (dev only) → latency (dev only, if configured)
2. All non-system routes hit `dynamicRouteHandler` (catch-all `app.all('*')`)
3. Router calls `findTypeForUrl(url, typesDir)` to resolve a TypeScript interface name from the URL
4. Calls `generateMockFromInterface` or `generateMockArray` from `src/core/parser.ts`
5. Results cached in `schemaCache` (single objects only, not arrays)

**URL → Interface resolution** (`src/utils/typeMapping.ts` + `src/utils/pluralize.ts`):
- Scans `typesDir` recursively for `.ts` files
- Only interfaces with `// @endpoint` (or in a JSDoc block containing `@endpoint`) are exposed
- `parseUrlSegments` strips leading `api` and `v{n}` prefix segments, then `isIdSegment` classifies each remaining segment as `col` (collection name) or `id` (numeric / UUID / MongoDB ObjectId)
- Supported URL shapes (anything else → 404):
  - `col` → plural collection → `isArray: true` (singular names like `/user` are rejected)
  - `col-id` → `/{resources}/{id}` → single item, `isArray: false`
  - `col-id-col` → `/{resources}/{id}/{sub-resources}` → `isArray: true` on the sub-resource type

**Mock generation** (`src/core/parser.ts`):
- Uses `intermock` with `isFixedMode: false` for random data
- After generation, `extractConstraints` parses the TypeScript AST (via `typescript` compiler API) for JSDoc annotations (`@min`, `@max`, `@minLength`, `@maxLength`, `@pattern`, `@enum`)
- `applyConstraintsToMock` in `src/core/constrainedGenerator.ts` then regenerates non-conforming fields using Faker

**Special headers** (dev mode only):
- `x-mock-status: <code>` — forces the response HTTP status code (handled by `src/middlewares/statusOverride.ts`; ignored in `strict` mode by not mounting the middleware)

**System routes** (not matched by dynamic handler):
- `GET /health` — server status + cache stats + list of available type names (`types: string[]`)
- `GET /api-docs` — Swagger UI (spec auto-regenerated on hot-reload file changes; includes type-selector dropdown for selective rebuild)
- `POST /mock-reset` — clear all mock data and re-seed
- `POST /mock-reset/:typeName` — regenerate mock data for a single type only; 404 if type unknown

**JSON persistence** (`persistData?: string | false` in `ServerConfig`):
- Opt-in via `--persist-data [path]` CLI or wizard advanced options (default path: `.mock-data.json`)
- Startup: `seedAllPools` runs first, then if file exists it loads pools from file (corrupt files are left untouched); then saves to ensure file matches `typesDir`
- After POST/PUT/PATCH/DELETE: `saveMockData` is called from `router.ts` via `maybePersist(config)`
- After `/mock-reset` or hot-reload: file is overwritten with fresh data
- `POST /mock-reset/:typeName`: only the target type is regenerated and saved
- File format: `{ TypeName: [...items] }` — keyed by TypeScript interface name, not route name
- Atomic write: write to `.mock-data.json.tmp` then `rename` (no corruption on interruption)
- Empty array `[]` is a valid persisted state (all items deleted) — not regenerated on reload
- Unknown keys in the file are silently skipped (debug log emitted)
- Module: `src/utils/dataPersistence.ts` — `saveMockData(store, typesDir, filePath)` and `loadMockData(store, typesDir, filePath)`
- `MockDataStore.getLivePool(typeName, filePath)` — the authoritative merge of pool + writeStore − deletedIds; used by both the router (GET collection) and the persistence module

**Key types** (`src/types/config.ts`): `ServerConfig`, `MockMode`, `RouteTypeMapping`, `InterfaceMetadata`, `ParsedSchema`, `MockGenerationOptions`


## grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

### When to Use grepai (REQUIRED)

Use `grepai search` INSTEAD OF Grep/Glob/find for:
- Understanding what code does or where functionality lives
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Exploring unfamiliar parts of the codebase
- Any search where you describe WHAT the code does rather than exact text

### When to Use Standard Tools

Only use Grep/Glob when you need:
- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.go`)

### Fallback

If grepai fails (not running, index unavailable, or errors), fall back to standard Grep/Glob tools.

### Usage

```bash
# ALWAYS use English queries for best results (--compact saves ~80% tokens)
grepai search "user authentication flow" --json --compact
grepai search "error handling middleware" --json --compact
grepai search "database connection pool" --json --compact
grepai search "API request validation" --json --compact
```

### Query Tips

- **Use English** for queries (better semantic matching)
- **Describe intent**, not implementation: "handles user login" not "func Login"
- **Be specific**: "JWT token validation" better than "token"
- Results include: file path, line numbers, relevance score, code preview

### Call Graph Tracing

Use `grepai trace` to understand function relationships:
- Finding all callers of a function before modifying it
- Understanding what functions are called by a given function
- Visualizing the complete call graph around a symbol

#### Trace Commands

**IMPORTANT: Always use `--json` flag for optimal AI agent integration.**

```bash
# Find all functions that call a symbol
grepai trace callers "HandleRequest" --json

# Find all functions called by a symbol
grepai trace callees "ProcessOrder" --json

# Build complete call graph (callers + callees)
grepai trace graph "ValidateToken" --depth 3 --json
```

### Workflow

1. Start with `grepai search` to find relevant code
2. Use `grepai trace` to understand function relationships
3. Use `Read` tool to examine files from results
4. Only use Grep for exact string searches if needed

