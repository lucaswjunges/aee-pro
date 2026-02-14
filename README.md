# AEE+ PRO

A production-ready SaaS platform that automates special education document generation using AI. Built for Brazilian teachers who work with students with disabilities (AEE - Atendimento Educacional Especializado).

Teachers enter student data once and generate 14+ professional document types automatically — plans, assessments, reports, and more — using any major AI provider.

**Live demo:** [aee-pro.pages.dev](https://aee-pro.pages.dev)

## Architecture

```
Frontend (React 19 + Vite)          Backend (Hono on CF Workers)
┌──────────────────────┐            ┌──────────────────────┐
│  Cloudflare Pages    │  REST API  │  Cloudflare Workers  │
│  SPA + Tailwind CSS  │◄──────────►│  Auth + AI + Export  │
│  shadcn/ui           │            │  Drizzle ORM         │
└──────────────────────┘            └──────────┬───────────┘
                                               │
                                    ┌──────────▼───────────┐
                                    │   Cloudflare D1      │
                                    │   (SQLite)           │
                                    └──────────────────────┘
```

**Monorepo** managed with Turborepo and pnpm:

```
apps/
  web/          → React 19 + Vite frontend (Cloudflare Pages)
  api/          → Hono framework backend (Cloudflare Workers)
packages/
  db/           → Drizzle schema, migrations, seed data
  shared/       → TypeScript types, Zod validation, constants
e2e/            → Playwright E2E tests
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 6, Tailwind CSS 4, React Router 7 |
| Backend | Hono 4, Cloudflare Workers (serverless) |
| Database | Cloudflare D1 (SQLite), Drizzle ORM |
| Auth | Session tokens, SHA-256 + salt password hashing |
| Encryption | AES-256-GCM with PBKDF2 key derivation (for API keys at rest) |
| AI | 9 provider integrations via adapter pattern |
| Export | DOCX generation with `docx` library, print-ready formatting |
| Testing | Vitest (unit/integration), Playwright (E2E) |
| Monorepo | Turborepo, pnpm workspaces |
| Deployment | Cloudflare Pages + Workers + D1 (free tier) |

## Key Features

### Multi-Provider AI Integration

Users configure their own API key for any of 9 supported providers. The backend uses a factory/adapter pattern — adding a new provider means implementing one interface:

- **Groq** (free) — Llama 3.3, Llama 4 Scout
- **Google Gemini** (free) — Gemini 2.5 Flash/Pro
- **OpenAI** — GPT-4.1, GPT-4.1 Mini, o3-mini
- **Anthropic** — Claude Sonnet 4.5, Opus 4.6
- **DeepSeek** — DeepSeek Chat, Reasoner
- **Mistral, Cohere, OpenRouter, Together AI**

### Batch AI Editing

Select multiple documents, type a single instruction (e.g., "Make it more detailed", "Summarize in bullet points"), and the system edits each document sequentially with progress tracking.

### Document Workspace

- Generate 14+ document types from student data (plans, assessments, reports)
- View, edit, regenerate, and export documents
- DOCX export with professional formatting (headings, bold, margins)
- Print-ready layout

### LGPD Compliance

This system handles sensitive data of minors with disabilities under Brazil's data protection law (Lei 13.709/2018, Articles 11 and 14):

- API keys encrypted at rest (AES-256-GCM)
- Guardian consent tracking before student registration
- Complete data isolation per user (multi-tenancy)
- Cascade deletion on data removal
- Privacy policy with third-party AI disclosure

## Database Schema

6 normalized tables managed with Drizzle ORM:

- **users** — teacher accounts with hashed passwords
- **sessions** — token-based authentication
- **students** — 50+ fields across identification, diagnosis, family, development, and AEE categories
- **documents** — generated documents with status tracking, AI provider metadata
- **prompts** — 14 built-in templates + user-created custom prompts
- **user_settings** — AI provider config with encrypted API keys

## API

6 route modules, all with authentication middleware:

| Route | Endpoints | Purpose |
|-------|-----------|---------|
| `/api/auth` | POST login, register, logout | Session-based auth |
| `/api/students` | CRUD | Student management |
| `/api/documents` | CRUD + generate, regenerate, edit-ai, export/docx | Document lifecycle |
| `/api/prompts` | CRUD + seed, reset | Prompt template management |
| `/api/settings` | GET, PUT + test-connection, password change | User configuration |
| `/api/dashboard` | GET | Statistics and overview |

## Running Locally

```bash
# Prerequisites: Node.js 20+, pnpm 9+
pnpm install

# Start frontend + API in dev mode
pnpm dev
# Frontend: http://localhost:5173
# API: http://localhost:8787

# Run tests
pnpm test          # Unit/integration (Vitest)
pnpm test:e2e      # E2E (Playwright)

# Type checking & lint
pnpm typecheck
pnpm lint

# Database
pnpm --filter @aee-pro/db generate          # Generate migrations from schema
pnpm --filter @aee-pro/api migrate:local    # Apply migrations locally
```

## Deploying to Cloudflare

```bash
# Login to Cloudflare
npx wrangler login

# Create D1 database
npx wrangler d1 create aee-pro-db
# Update database_id in apps/api/wrangler.toml

# Apply migrations
npx wrangler d1 migrations apply aee-pro-db --remote

# Set secrets
npx wrangler secret put SESSION_SECRET

# Deploy backend
pnpm --filter @aee-pro/api deploy

# Build & deploy frontend
VITE_API_URL=https://your-worker.workers.dev/api pnpm --filter @aee-pro/web build
npx wrangler pages deploy apps/web/dist --project-name aee-pro

# Seed built-in prompts
curl -X POST https://your-worker.workers.dev/api/prompts/seed
```

Runs entirely on Cloudflare's free tier (100k Worker requests/day, 5M D1 reads/day).

## Project Stats

- **102** TypeScript/TSX source files
- **12** pages, **19** reusable components
- **6** API route modules
- **9** AI provider integrations
- **14** built-in document templates
- **4** database migrations
- **0** monthly hosting cost (Cloudflare free tier)

## License

Proprietary. All rights reserved.
