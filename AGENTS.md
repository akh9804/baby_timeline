# Project Instructions

## Goal

This is a learning-oriented personal family media server.

The developer is an experienced frontend engineer but is learning backend development, Fastify, SQL, and server architecture through this project.

Codex may directly modify and implement code, but every meaningful change must be explained so that the developer can understand the underlying backend concepts and architectural decisions.

Do not over-engineer or introduce abstractions prematurely.

## Stack

- Node.js 24 LTS
- pnpm
- TypeScript
- ESM
- Fastify
- SQLite
- React + Vite will be added later
- Media files will eventually be stored on an external HDD
- The application will eventually be exposed through Cloudflare Tunnel

## TypeScript

The server uses Node ESM semantics.

Use:

- `module: NodeNext`
- `moduleResolution: NodeNext`

Relative imports should use the runtime `.js` extension:

```javascript
import { buildApp } from './app.js';
```

Development execution uses `tsx`.

Production execution should use compiled JavaScript:

```text
TypeScript -> tsc -> JavaScript -> Node.js
```

## Fastify

Prefer Fastify's native architecture and conventions.

Learn and use:

- `register()`
- plugins
- encapsulation
- hooks
- decorators
- schemas
- `inject()` for testing

Separate application construction from server startup:

```text
app.ts
  -> constructs/configures Fastify

server.ts
  -> calls listen()
```

Do not introduce service/repository/controller layers unless complexity actually requires them.

Start with simple `plugins/` and `routes/` structures.

## Development Philosophy

This project is both a real application and a backend learning project.

Codex should implement requested changes directly, but implementation speed must not come at the cost of understanding.

When making changes:

1. Prefer official documentation and idiomatic APIs.
2. Modify the code directly when implementation is requested.
3. Explain every meaningful architectural or backend-related change after implementing it.
4. Explain not only what changed, but why the code is needed and how it works.
5. When introducing a new backend concept, explain it from the perspective of a frontend engineer who may not have encountered it before.
6. When useful, compare backend concepts with familiar frontend concepts, but do not force analogies when they would be misleading.
7. Avoid generating large amounts of infrastructure at once.
8. Make changes incrementally so each step can be understood independently.
9. Do not introduce libraries unless they solve a concrete current problem.
10. Prefer understanding SQL fundamentals before introducing an ORM.
11. Do not hide important behavior behind abstractions before explaining the underlying mechanism.
12. If multiple approaches are possible, briefly explain the trade-offs and why the chosen approach fits this project.

## Explanation Requirements

After implementing a meaningful change, provide an explanation containing:

### What changed

Summarize the files and behavior that were added or modified.

### Why it is needed

Explain the problem the change solves and why it belongs in the project.

### How it works

Explain the important execution flow and relevant framework/runtime behavior.

For example, when adding a Fastify plugin, explain:

- why it is a plugin
- how `register()` loads it
- what scope/encapsulation it receives
- when its routes/hooks become available

When adding database code, explain:

- what SQL operation is happening
- how the connection/query lifecycle works
- what constraints or indexes are used and why

When adding Node.js-specific code, explain relevant runtime behavior such as:

- ESM module resolution
- streams
- filesystem access
- processes
- environment variables
- HTTP request/response lifecycle

Do not spend time explaining trivial TypeScript or frontend concepts unless they are relevant to the architectural decision.

## Changes Should Be Reviewable

Prefer small, focused changes.

Avoid implementing several major architectural layers in one step unless explicitly requested.

For larger tasks:

1. Break the work into logical steps.
2. Implement the current step.
3. Explain it.
4. Identify what the next step would be.

This should make it possible for the developer to inspect and understand the project as it evolves.

## Planned Progression

Implement features roughly in this order:

1. Basic Fastify application
2. Routes/plugins and tests using `inject()`
3. SQLite and basic SQL
4. Media metadata API
5. External HDD storage abstraction
6. File upload and streaming
7. React + Vite client
8. Image/video processing
9. Authentication/authorization
10. Mac mini deployment and Cloudflare Tunnel

Do not implement later stages prematurely.
