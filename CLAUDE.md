# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AEE+ PRO** — SaaS web application that automates document generation for AEE (Atendimento Educacional Especializado) using AI. Teachers enter student data once and generate 14+ document types automatically.

**Business model**: One-time purchase (no subscription), automatic updates via web. Target price: R$200-400+.
**Target users**: Special education teachers in Brazil — non-technical, need simplicity.

## Architecture

### Stack

- **Monorepo** managed with Turborepo
- **Frontend**: React 19 + Vite, deployed to Cloudflare Pages
- **Backend API**: Hono framework on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **File storage**: Cloudflare R2 (generated documents, user uploads)
- **Auth**: Cloudflare Workers + D1 (email/password with session tokens)
- **Styling**: Tailwind CSS 4 + shadcn/ui components
- **Mobile (future)**: Capacitor wrapping of the web app — architecture must keep this path open (no SSR dependencies, relative paths, responsive-first)
- **Tests**: Vitest (unit/integration) + Playwright (E2E)

### Project Structure

```
├── apps/
│   ├── web/                → React + Vite frontend (Cloudflare Pages)
│   └── api/                → Hono Workers backend (Cloudflare Workers)
├── packages/
│   ├── db/                 → Drizzle schema, migrations
│   └── shared/             → Types, constants, Zod validation schemas
├── e2e/                    → Playwright E2E tests
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Key Architectural Decisions

1. **Prompts are server-side only**. Janete's 14 AI prompts are the core IP of the product. They live in D1 (seeded from `docs/prompts/`), served only via Worker API, and NEVER sent to the frontend. The frontend sends student data + document type; the Worker assembles the full prompt, calls the AI, and returns the generated text.

2. **Multi-provider AI**. Users configure their own API key for OpenAI, Anthropic, Gemini, or other providers. The API layer has a provider abstraction (`AIProvider` interface) so adding new providers requires implementing one adapter. The system also recommends free/cheap options.

3. **User-created prompts and templates**. Beyond Janete's built-in 14 prompts, users can create, edit, and manage their own custom prompts and document templates. Built-in prompts are read-only for users; custom prompts are fully editable.

4. **Document workspace** — a file-manager-like UI inside the app where users can:
   - See all generated documents for a student with preview icons
   - Select multiple documents for batch operations (regenerate, export, delete)
   - Invoke AI agents to edit/refine multiple documents at once
   - Preview documents before exporting

5. **Dark mode** follows the user's OS preference via `prefers-color-scheme`, with manual toggle available. Tailwind `darkMode: 'class'` strategy with system detection on load.

6. **LGPD compliance** (Lei 13.709/2018). This system handles sensitive data of minors with disabilities (Art. 11 and Art. 14). All student data must be encrypted at rest, require guardian consent before registration, and have a clear privacy policy. API calls to AI providers must be disclosed in terms of use.

7. **Export formats**: PDF (formatted, print-ready) and DOCX (editable). Teachers need to print, email, and archive documents.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run everything (frontend + API) in dev mode
pnpm dev

# Run only the frontend
pnpm --filter @aee-pro/web dev

# Run only the API (Workers local via wrangler)
pnpm --filter @aee-pro/api dev

# Run all tests
pnpm test

# Run tests for a single package
pnpm --filter @aee-pro/web test
pnpm --filter @aee-pro/api test

# Run a single test file
npx vitest run apps/web/src/__tests__/login.test.tsx

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Build for production
pnpm build

# Deploy
pnpm deploy                              # Deploy all
pnpm --filter @aee-pro/web deploy        # Deploy frontend only
pnpm --filter @aee-pro/api deploy        # Deploy API only

# Database
pnpm --filter @aee-pro/db generate       # Generate migrations from schema
pnpm --filter @aee-pro/api migrate:local  # Apply migrations locally

# E2E tests
pnpm test:e2e
```

## Reference Materials

All of Janete's original materials live in `docs/` and must be read to understand the domain:

| Directory | Contents |
|-----------|----------|
| `docs/prompts/` | The 14 structured AI prompts — the core IP. `AEE PROMPT Janete.docx` has clean prompt text. `Prompts AEE Automáticos.html` has full context including market analysis and product definition. |
| `docs/referencia-janete/` | 200+ files in 18 categories — the complete AEE methodology. Authoritative reference for document formats, fields, and structure. |
| `docs/exemplos/` | Real filled-out documents (PDI, PEI, Parecer) — reference for expected output quality and formatting. |
| `docs/fichas/` | Template forms teachers use daily — reference for data fields needed. |
| `docs/anamnese/` | Intake assessment models by school level. |
| `docs/negocio/` | Business docs: pricing, ideas, meeting notes, client requirements. |
| `projeto/` | Project analysis, technical decisions, and planning notes. |

## Student Data Schema

The student record has these field groups (derived from Janete's templates in `docs/`):

- **Identificação**: nome, data_nascimento, idade, sexo, escola, ano_serie, turma, turno, matricula, prof_regular, prof_aee, coordenadora
- **Diagnóstico**: diagnostico_cid, classificacao (TEA 1/2/3, TDAH, TOD, DI, deficiências, altas habilidades, dislexia, discalculia), medicamentos, alergias, terapias_atuais, historico_medico
- **Família**: mae (nome/idade/profissao/escolaridade), pai (idem), composicao_familiar, responsavel_principal, contato, endereco, rotina_familiar, comunicacao_casa
- **Desenvolvimento**: motor, linguagem, cognitivo, social, autonomia, comportamento_emocional, habilidades_academicas (leitura/escrita/matematica)
- **AEE**: tipo_atendimento, frequencia, dificuldades_iniciais, potencialidades, barreiras, necessidades_acessibilidade, expectativas_familia

## Rules

- All UI text, labels, errors, and messages in **Brazilian Portuguese**
- Follow Janete's terminology: PAEE, PEI, PDI, Anamnese, Estudo de Caso — never translate or rename these
- The audience is non-technical teachers: every interaction must be simple, clear, and forgiving
- Mobile-first responsive design — no layout that breaks below 375px
- Every new feature needs tests (Vitest for logic, Playwright for critical user flows)
- API endpoints follow REST conventions: `GET /api/alunos`, `POST /api/documentos/gerar`, etc.
- All dates in Brazilian format: `dd/mm/aaaa`
- Currency in BRL: `R$ 1.234,56`
