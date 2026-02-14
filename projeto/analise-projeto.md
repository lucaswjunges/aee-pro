# Análise Crítica — Projeto AEE+ PRO

## O que está bom

- A dor é real e validada — professor de AEE gasta horas em burocracia repetitiva
- A Janete já tem os prompts estruturados — o "cérebro" do produto já existe
- Web-first + mobile-friendly + Cloudflare é uma stack moderna e barata

---

## O que precisa ser resolvido ANTES de codar

### 1. LGPD — Isso é urgente e ninguém mencionou

Vocês vão lidar com **dados de menores com deficiência**. Isso é **dado sensível** na LGPD (Lei 13.709/2018, Art. 11 e Art. 14). Implicações:

- Precisa de **consentimento explícito dos responsáveis legais**
- Precisa de **política de privacidade** clara
- Precisa definir **onde os dados ficam armazenados** (Cloudflare R2? D1? servidor no Brasil?)
- Se usar API da OpenAI, os dados do aluno **passam pelos servidores deles** — isso precisa estar no termo de uso
- Vazamento desses dados pode dar **processo judicial sério**

**Sugestão**: Criar um termo de consentimento simples que a professora coleta dos responsáveis antes de cadastrar o aluno.

### 2. Contradição de abordagem

O `janete.md` fala em Google Forms, Planilhas, Notion, no-code. O `lucas.md` fala em website no Cloudflare. São caminhos **completamente diferentes**. Antes de tudo:

- **Isso é um produto SaaS** que a Janete vai vender para outros professores?
- **Ou é uma ferramenta pessoal** só para ela?

Se for SaaS → website custom no Cloudflare faz sentido.
Se for pessoal → Google Sheets + Apps Script resolve em 2 dias e custa zero.

Essa definição muda **tudo**: arquitetura, auth, banco de dados, custos, prazo.

### 3. Os prompts são o IP — precisam de proteção

Os prompts estruturados da Janete **são o produto**. Se ficarem no frontend (JavaScript), qualquer pessoa abre o DevTools e copia tudo. Eles precisam ficar:

- No **backend** (Cloudflare Workers)
- Nunca expostos ao cliente
- Idealmente em um banco ou KV, não hardcoded

### 4. Custo de API de IA — quem paga?

Cada documento gerado = chamada de API = dinheiro. Para 10 tipos de documento por aluno:

- ~10 chamadas × ~$0.01-0.05 cada = $0.10 a $0.50 por aluno
- 30 alunos = $3 a $15/mês só de API
- Se for SaaS com 100 professores × 30 alunos = $300-1500/mês

**Precisa definir**: Quem paga? É repassado ao usuário? Tem limite de uso?

### 5. MVP precisa ser menor

A lista tem **11 tipos de documento**. Para um MVP real, sugiro:

1. Cadastro do aluno (dados base)
2. Geração de **2-3 documentos** mais usados (ex: PDI + Estudo de Caso + Relatório)
3. Exportação em PDF/DOCX

O resto entra em iterações futuras. Lançar rápido e validar > fazer tudo e nunca lançar.

### 6. Fluxo de revisão

IA gera texto, mas **professora precisa revisar e editar** antes de usar oficialmente. O sistema precisa de:

- Tela de edição pós-geração (editor de texto simples)
- Opção de regenerar trechos específicos
- Salvar versão final vs rascunho

Sem isso, vira só um "ChatGPT com prompt fixo" — não tem valor agregado real.

### 7. Formato de exportação

Professores precisam **imprimir** ou **enviar por email**. Precisa definir:

- PDF formatado bonito? (precisa de lib de PDF)
- DOCX editável? (mais flexível, mas mais complexo)
- Ambos?

### 8. Autenticação

Se for multi-usuário: precisa de login (Cloudflare Zero Trust, ou auth simples com email/senha).
Se for single-user: pelo menos uma senha básica — são dados de menores.

**Dados de alunos com deficiência nunca podem ficar acessíveis sem autenticação.**

---

## Próximos passos propostos

1. **Alinhar com a Janete**: É produto ou ferramenta pessoal?
2. **Definir o MVP real**: Quais 2-3 documentos são prioridade?
3. **Resolver LGPD**: Redigir termo de consentimento e política de privacidade
4. **Escolher a API de IA**: OpenAI? Anthropic? Custo, qualidade, localização dos dados
5. **Definir stack final**:
   - Frontend: HTML/CSS/JS (ou framework leve como Svelte)
   - Backend: Cloudflare Workers + D1 (SQLite) + R2 (arquivos)
   - IA: API server-side via Worker
6. **Wireframe antes de código**: Desenhar as telas no papel/Figma antes de implementar
