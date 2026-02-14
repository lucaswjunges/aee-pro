# Deploy — AEE+ PRO

## Pré-requisitos

1. Conta na [Cloudflare](https://dash.cloudflare.com)
2. Wrangler CLI instalado: `pnpm add -g wrangler`
3. Login: `wrangler login`

## 1. Criar banco D1 na Cloudflare

```bash
cd apps/api
wrangler d1 create aee-pro-db
```

Copie o `database_id` do output e cole em `apps/api/wrangler.toml`:

```toml
database_id = "COLE-O-ID-AQUI"
```

## 2. Aplicar migrations no D1 remoto

```bash
cd apps/api
wrangler d1 migrations apply aee-pro-db --remote
```

## 3. Configurar secret

```bash
cd apps/api
wrangler secret put SESSION_SECRET
# Digite uma string aleatória longa (ex: openssl rand -hex 32)
```

## 4. Deploy da API (Workers)

```bash
pnpm --filter @aee-pro/api deploy
```

Anote a URL do Worker (ex: `https://aee-pro-api.seu-usuario.workers.dev`).

## 5. Configurar URL da API no frontend

Edite `apps/web/src/lib/api.ts` e troque `API_BASE` para a URL do Worker em produção, ou configure via variável de ambiente.

Para o Cloudflare Pages, use a variável `VITE_API_URL`:

```bash
# No build do Pages:
VITE_API_URL=https://aee-pro-api.seu-usuario.workers.dev
```

## 6. Deploy do Frontend (Pages)

```bash
pnpm --filter @aee-pro/web deploy
```

Ou via dashboard da Cloudflare: conecte o repositório Git e configure:
- **Build command**: `pnpm build`
- **Build output**: `apps/web/dist`
- **Root directory**: `/`

## 7. Semear prompts em produção

```bash
curl -X POST https://aee-pro-api.seu-usuario.workers.dev/api/prompts/seed
```

## Resumo de custos

| Serviço | Plano gratuito |
|---------|---------------|
| Cloudflare Workers | 100k req/dia |
| Cloudflare D1 | 5M linhas lidas/dia, 100k escritas/dia |
| Cloudflare Pages | Ilimitado |
| Groq (IA) | Gratuito |
| Gemini (IA) | 15 req/min gratuito |
