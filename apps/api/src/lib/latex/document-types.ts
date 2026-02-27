export interface DocumentTypeConfig {
  slug: string;
  name: string;
  instruction: string;
}

export const DOCUMENT_TYPE_CONFIGS: Record<string, DocumentTypeConfig> = {
  "anamnese": {
    slug: "anamnese",
    name: "Anamnese",
    instruction: `Gere uma ANAMNESE completa para AEE contendo:
- Capa com dados da escola e do aluno (use TikZ para capa se heat >= 4)
- Datacard de identificação com todos os dados do aluno
- Seção de histórico gestacional e de nascimento
- Desenvolvimento neuropsicomotor (marcos motores, linguagem, controle esfincteriano)
- Histórico de saúde (diagnósticos, medicações, alergias, internações)
- Alertbox com informações diagnósticas relevantes
- Contexto familiar e socioeconômico
- Histórico escolar (escolas anteriores, retenções, adaptações já realizadas)
- Comportamento e socialização
- Habilidades acadêmicas atuais
- Expectativas da família
- Considerações finais e encaminhamentos`,
  },
  "estudo-de-caso": {
    slug: "estudo-de-caso",
    name: "Estudo de Caso",
    instruction: `Gere um ESTUDO DE CASO completo para AEE contendo:
- Capa profissional (use TikZ para capa se heat >= 4)
- Sumário (\\tableofcontents)
- Dados de identificação em datacard
- Diagnóstico e saúde em alertbox
- Contexto familiar (com diagrama TikZ da árvore familiar se heat >= 3)
- Barreiras vs Potencialidades (diagrama lado a lado em TikZ se heat >= 3)
- Análise do desenvolvimento com gráfico de barras pgfplots (se heat >= 3) mostrando nível por dimensão
- Estratégias de intervenção em tabela colorida
- Cronograma de acompanhamento (timeline TikZ se heat >= 3)
- Orientações à família em successbox
- Orientações à equipe escolar em infobox
- Considerações finais
- Espaço para assinaturas`,
  },
  "pdi": {
    slug: "pdi",
    name: "PDI - Plano de Desenvolvimento Individual",
    instruction: `Gere um PDI (Plano de Desenvolvimento Individual) para AEE contendo:
- Capa profissional
- Dados de identificação em datacard
- Diagnóstico e perfil funcional
- Tabela de objetivos gerais e específicos por área (cognitiva, linguagem, social, motora, autonomia)
- Metas mensuráveis com critérios de avaliação e prazos
- Estratégias e recursos por objetivo
- Cronograma de reavaliação (timeline TikZ se heat >= 3)
- Adaptações curriculares necessárias
- Articulação com sala regular
- Indicadores de progresso
- Espaço para assinaturas`,
  },
  "plano-intervencao": {
    slug: "plano-intervencao",
    name: "Plano de Intervenção",
    instruction: `Gere um PLANO DE INTERVENÇÃO para AEE contendo:
- Capa profissional
- Dados de identificação
- Justificativa da intervenção
- Objetivos (gerais e específicos)
- Atividadebox com atividades detalhadas (descrição, materiais, passo a passo, tempo estimado)
- Sessaobox com cronograma semanal de sessões
- Estratégias de mediação
- Materiais necessários em materialbox
- Dicas práticas em dicabox
- Critérios de avaliação
- Cronograma de reavaliação`,
  },
  "adaptacoes-curriculares": {
    slug: "adaptacoes-curriculares",
    name: "Adaptações Curriculares",
    instruction: `Gere um documento de ADAPTAÇÕES CURRICULARES para AEE contendo:
- Dados de identificação
- Justificativa pedagógica
- Tabela por disciplina (Português, Matemática, Ciências, etc.) com:
  - Conteúdo original vs adaptado
  - Estratégias de ensino
  - Recursos e materiais
  - Forma de avaliação
- Infobox com estratégias gerais por área
- Orientações para o professor regente
- Flexibilização de tempo e espaço
- Tecnologia assistiva recomendada
- Monitoramento e reavaliação`,
  },
  "adaptacao-avaliacoes": {
    slug: "adaptacao-avaliacoes",
    name: "Adaptação de Avaliações",
    instruction: `Gere um documento de ADAPTAÇÃO DE AVALIAÇÕES para AEE contendo:
- Dados de identificação
- Perfil do aluno para avaliação
- Tabela de adaptações por tipo de avaliação (prova escrita, oral, trabalho, participação)
- Adaptações de formato (fonte maior, espaçamento, enunciados simplificados)
- Adaptações de tempo (tempo estendido, pausas)
- Adaptações de instrumento (uso de calculadora, apoio de leitura, prova oral)
- Dicabox com dicas para elaboração de provas inclusivas
- Critérios de avaliação diferenciados
- Modelo de ficha de avaliação adaptada`,
  },
  "diario-bordo": {
    slug: "diario-bordo",
    name: "Diário de Bordo",
    instruction: `Gere um modelo de DIÁRIO DE BORDO para AEE contendo:
- Dados de identificação do aluno
- Template de registro de sessão com campos para:
  - Data, horário, duração
  - Objetivos da sessão
  - Atividades realizadas
  - Nível de engajamento (escala visual)
  - Nível de apoio necessário
  - Comportamento observado
  - Conquistas/avanços
  - Dificuldades observadas
  - Observações
- Tabela de sessões do mês (se heat >= 3)
- Resumo mensal
- Gráfico de evolução (se heat >= 4)`,
  },
  "avancos-retrocessos": {
    slug: "avancos-retrocessos",
    name: "Avanços e Retrocessos",
    instruction: `Gere um relatório de AVANÇOS E RETROCESSOS para AEE contendo:
- Dados de identificação
- Período avaliado
- Comparação lado a lado (antes vs agora) por área:
  - Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico
- Gráfico pgfplots de evolução comparativa (se heat >= 3)
- Avanços significativos em successbox
- Pontos de atenção/retrocesso em alertbox
- Fatores que contribuíram para avanços
- Fatores que dificultaram o progresso
- Ajustes necessários no plano
- Recomendações para o próximo período`,
  },
  "relatorio-familia": {
    slug: "relatorio-familia",
    name: "Relatório para Família",
    instruction: `Gere um RELATÓRIO PARA A FAMÍLIA do aluno AEE contendo:
- Tom acolhedor e acessível (LINGUAGEM SIMPLES, sem jargão técnico excessivo)
- Dados de identificação resumidos
- O que é o AEE e como funciona (explicação breve para a família)
- O que tem sido trabalhado nas sessões
- Conquistas e progressos do aluno em successbox
- Orientações para casa em infobox
- Atividades que a família pode fazer em casa
- Importância da frequência e parceria
- Canal de comunicação
- Mensagem de encerramento acolhedora e motivadora`,
  },
  "relatorio-professor": {
    slug: "relatorio-professor",
    name: "Relatório para Professor Regente",
    instruction: `Gere um RELATÓRIO PARA O PROFESSOR REGENTE contendo:
- Tom técnico e objetivo
- Dados de identificação
- Perfil do aluno (resumo do diagnóstico, como o aluno aprende melhor)
- O que está sendo trabalhado no AEE
- Tabela de estratégias para sala regular (organização, comunicação, manejo, materiais)
- Adaptações sugeridas para atividades e avaliações
- Potencialidades a explorar na sala regular
- Sinais de alerta
- Articulação AEE-Sala Regular
- Sugestões de materiais e recursos`,
  },
  "ata-reuniao": {
    slug: "ata-reuniao",
    name: "Ata de Reunião",
    instruction: `Gere um modelo de ATA DE REUNIÃO sobre o aluno AEE contendo:
- Cabeçalho formal (escola, data, horário, local, assunto)
- Tabela de participantes (com espaço para nome, função, assinatura)
- Pauta da reunião (tópicos baseados no perfil do aluno)
- Situação atual do aluno (resumo)
- Espaço para registro de discussões por tópico
- Decisões tomadas
- Tabela de encaminhamentos (ação, responsável, prazo)
- Data da próxima reunião
- Espaço para assinaturas`,
  },
  "rotina-visual": {
    slug: "rotina-visual",
    name: "Rotina Visual (Descritiva)",
    instruction: `Gere uma ROTINA VISUAL DESCRITIVA para AEE contendo:
- Dados de identificação
- Justificativa da rotina visual para este aluno
- Diagrama de fluxo TikZ da rotina do AEE (se heat >= 3):
  - Chegada → Acolhimento → Atividade principal → Pausa → Atividade complementar → Fechamento
- Rotina da sala regular (sugestão adaptada ao aluno)
- Apoios visuais recomendados (pictogramas, cores, tamanhos)
- Estratégias de transição entre atividades
- Orientações para família (rotina em casa)
- Dicas de confecção (materiais, plastificação, velcro)`,
  },
  "agrupamento-alunos": {
    slug: "agrupamento-alunos",
    name: "Agrupamento de Alunos",
    instruction: `Gere uma PROPOSTA DE AGRUPAMENTO para AEE contendo:
- Dados do aluno de referência
- Perfil para agrupamento
- Critérios de agrupamento (faixa etária, objetivos, desenvolvimento, habilidades, comportamento)
- Tabela de perfil ideal dos demais alunos do grupo
- Objetivos do atendimento em grupo (acadêmicos, sociais, autonomia)
- Atividades sugeridas para o grupo
- Organização do atendimento (tamanho, frequência, duração, espaço)
- Papel do professor AEE
- Indicadores de sucesso
- Observações e cuidados`,
  },
  "parecer-descritivo": {
    slug: "parecer-descritivo",
    name: "Parecer Descritivo",
    instruction: `Gere um PARECER DESCRITIVO formal para AEE contendo:
- Dados de identificação completos
- Diagnóstico e contexto
- Desenvolvimento global por aspecto:
  - Cognitivo, Motor, Linguagem, Social, Emocional, Autonomia
- Desempenho acadêmico (Português, Matemática, demais áreas)
- Gráfico pgfplots de avaliação por dimensão (se heat >= 4)
- Participação no AEE
- Avanços do período em successbox
- Aspectos em desenvolvimento em alertbox
- Estratégias utilizadas
- Recomendações
- Considerações finais`,
  },
  "sugestao-atendimento": {
    slug: "sugestao-atendimento",
    name: "Sugestão de Atendimento",
    instruction: `Gere uma SUGESTÃO DE ATENDIMENTO AEE com visual PUBLICÁVEL, acolhedor e rico.
Este é um guia prático de atividades — deve ser bonito, colorido e convidativo, não um relatório burocrático.
Use generosamente os ambientes visuais disponíveis (atividadebox, dicabox, sessaobox, materialbox, successbox, infobox, objtag).

ESTRUTURA OBRIGATÓRIA:
1. CAPA TikZ elaborada: retângulo aeeblue no topo, título \\Huge aeegold, card branco com drop shadow contendo dados do aluno (nome, idade, diagnóstico, escola, professora AEE, frequência, data), fileira de ícones TikZ representando as 5 áreas (Leitura, Escrita, Social, Autonomia, Comunicação)
2. \\tableofcontents + \\newpage
3. PERFIL E OBJETIVOS: Diagrama TikZ estilo mind map com o aluno no centro e 5 objetivos ao redor (cada um em block colorido com setas). Seguido de dicabox com a expectativa da família.
4. ESTRUTURA DAS SESSÕES: Diagrama TikZ de fluxo horizontal com 4 fases (Acolhida→Atividade Principal→Complementar→Fechamento), cada fase com cor distinta, label de tempo acima. Seguido de materialbox com material fixo.
5. BANCO DE ATIVIDADES — LEITURA (3 atividades): Cada uma em atividadebox[aeegreen] com \\starmark, objtags coloridos, descrição rica, lista de materiais, passo a passo numerado detalhado, variações, tempo estimado. Intercalar com dicabox de dicas práticas.
6. BANCO DE ATIVIDADES — ESCRITA (2+ atividades): atividadebox[aeeblue]. Uma delas DEVE ter diagrama TikZ de progressão (ex: Fase 1→2→3→4→5 com setas).
7. BANCO DE ATIVIDADES — SOCIALIZAÇÃO E COMUNICAÇÃO (2+ atividades): atividadebox[aeepurple]
8. BANCO DE ATIVIDADES — AUTONOMIA E ROTINA (2+ atividades): atividadebox[aeeorange]. Uma DEVE ter tabularx com estações de circuito com \\rowcolor alternado.
9. PLANEJAMENTO SEMANAL (4 semanas): Cada semana em sessaobox[Semana N — Foco: X] com tabularx interna (colunas: Dia, Acolhida, Atividade Principal, Complementar, Fechamento) e \\rowcolor{aeelightblue} alternado.
10. INDICADORES DE PROGRESSO: Ficha de registro em TikZ (node com tabularx dentro, drop shadow, cabeçalho aeeblue com texto branco, campos: data, atividade, engajamento, apoio, comportamento, conquista, observações). Tabela de metas mensuráveis por área com \\rowcolor{lightgreen} alternado.
11. RECURSOS GRATUITOS: Tabela com recurso, descrição, tipo (App/Online), com \\rowcolor{aeelightblue} alternado.
12. Assinaturas (seguir modelo do system prompt) + rodapé com créditos AEE+ PRO.

QUALIDADE VISUAL: Cada atividade deve ocupar pelo menos meia página. Use \\objtag coloridos generosamente. Alterne texto com boxes — nunca mais de meia página sem elemento visual. As descrições das atividades devem ser DETALHADAS e PRÁTICAS (materiais reais, passos numerados específicos, dicas para o professor).`,
  },
  "ficha-matricula-aee": {
    slug: "ficha-matricula-aee",
    name: "Ficha de Matrícula no AEE",
    instruction: `Gere uma FICHA DE MATRÍCULA NO AEE completa contendo:
- Cabeçalho oficial com dados da escola (nome, CNPJ, endereço, telefone)
- Título: "Ficha de Matrícula — Atendimento Educacional Especializado"
- Seção 1: Dados do aluno em datacard (nome completo, data de nascimento, idade, sexo, naturalidade, CPF se disponível, série/turma/turno, matrícula)
- Seção 2: Dados do responsável (nome, parentesco, CPF, RG, telefone, endereço completo)
- Seção 3: Informações diagnósticas em alertbox (CID, diagnóstico, classificação, laudo médico: sim/não, data do laudo)
- Seção 4: Histórico escolar resumido (escolas anteriores, AEE anterior, retenções)
- Seção 5: Necessidades específicas (tipo de atendimento, frequência solicitada, recursos de acessibilidade, terapias externas)
- Seção 6: Informações complementares (medicamentos, alergias, contatos de emergência)
- Seção 7: Declaração do responsável (texto padrão sobre ciência das regras do AEE)
- Campo de data e espaço para assinaturas
- Use tabelas para organizar dados em pares chave-valor`,
  },
  "entrevista-familia": {
    slug: "entrevista-familia",
    name: "Entrevista com a Família",
    instruction: `Gere um roteiro de ENTREVISTA COM A FAMÍLIA para AEE contendo:
- Capa com dados do aluno e data da entrevista
- Seção 1: Dados de identificação do aluno e do entrevistado (parentesco, profissão, escolaridade)
- Seção 2: Gestação e nascimento (intercorrências, tipo de parto, peso, APGAR)
- Seção 3: Desenvolvimento infantil (marcos motores, fala, controle esfincteriano, alimentação)
- Seção 4: Histórico de saúde (diagnósticos, medicações, cirurgias, terapias atuais e passadas)
- Seção 5: Rotina familiar e doméstica (moradia, cuidadores, rotina diária, autonomia em casa)
- Seção 6: Vida escolar (primeira escola, adaptação, queixas da escola, reuniões anteriores)
- Seção 7: Socialização e comportamento (amizades, brincadeiras, birras, medos, interesses)
- Seção 8: Comunicação (como se expressa em casa, compreensão de instruções, linguagem)
- Seção 9: Expectativas da família (o que esperam do AEE, preocupações, sonhos para o filho)
- Seção 10: Observações do entrevistador
- Use campos de preenchimento (linhas pontilhadas ou espaços) para respostas abertas
- Tom acolhedor nas perguntas (família deve se sentir confortável)`,
  },
  "termo-lgpd": {
    slug: "termo-lgpd",
    name: "Termo de Ciência e Autorização (LGPD)",
    instruction: `Gere um TERMO DE CIÊNCIA E AUTORIZAÇÃO conforme a LGPD (Lei 13.709/2018) para AEE contendo:
- Cabeçalho oficial da escola
- Título: "Termo de Ciência e Autorização para Tratamento de Dados Pessoais"
- Subtítulo: "Atendimento Educacional Especializado (AEE)"
- Identificação das partes: escola (controladora) e responsável pelo aluno (titular)
- Seção 1: Finalidade do tratamento (descrição clara de por que os dados são coletados)
- Seção 2: Dados coletados em tabela (tipo de dado, finalidade, base legal — Art. 11 e Art. 14 da LGPD)
  - Dados pessoais do aluno, dados sensíveis de saúde, dados familiares
- Seção 3: Compartilhamento (com quem os dados podem ser compartilhados: equipe pedagógica, profissionais de saúde, sistemas informatizados)
- Seção 4: Uso de inteligência artificial (declaração sobre uso de IA para geração de documentos, anonimização dos dados enviados)
- Seção 5: Direitos do titular (acesso, correção, exclusão, portabilidade — Art. 18 da LGPD)
- Seção 6: Armazenamento e segurança (como os dados são protegidos, prazo de retenção)
- Seção 7: Revogação do consentimento (como o responsável pode revogar)
- Texto de consentimento claro e objetivo
- Linguagem acessível (público não-jurídico)
- Espaço para data e assinaturas`,
  },
  "ficha-observacao-inicial": {
    slug: "ficha-observacao-inicial",
    name: "Ficha de Observação Inicial",
    instruction: `Gere uma FICHA DE OBSERVAÇÃO INICIAL para AEE contendo:
- Dados de identificação do aluno
- Data(s) da observação e ambiente (sala regular, AEE, recreio, etc.)
- Seção 1: Comportamento geral (postura, atenção, engajamento, interação)
- Seção 2: Comunicação (expressão verbal, compreensão, gestos, contato visual)
- Seção 3: Aspectos cognitivos (compreensão de instruções, resolução de problemas, memória, raciocínio)
- Seção 4: Aspectos motores (coordenação fina — escrita, recorte; coordenação ampla — equilíbrio, postura)
- Seção 5: Socialização (interação com colegas, com adultos, comportamento em grupo, recreio)
- Seção 6: Autonomia (alimentação, higiene, organização de materiais, deslocamento)
- Seção 7: Aspectos emocionais (humor, frustrações, autoestima, regulação emocional)
- Seção 8: Habilidades acadêmicas observadas (leitura, escrita, matemática — nível funcional)
- Seção 9: Pontos fortes e interesses do aluno em successbox
- Seção 10: Pontos de atenção e barreiras em alertbox
- Seção 11: Impressões e próximos passos
- Use escala de observação quando apropriado (Não observado / Em desenvolvimento / Adequado / Destaque)`,
  },
  "avaliacao-diagnostica-funcional": {
    slug: "avaliacao-diagnostica-funcional",
    name: "Avaliação Diagnóstica Funcional",
    instruction: `Gere uma AVALIAÇÃO DIAGNÓSTICA FUNCIONAL completa para AEE contendo:
- Capa profissional
- Sumário (\\tableofcontents)
- Seção 1: Identificação e contexto (datacard com dados do aluno, diagnóstico, equipe avaliadora)
- Seção 2: Metodologia (instrumentos utilizados, datas, contextos de observação)
- Seção 3: Perfil funcional por dimensão (tabela detalhada):
  - Cognitivo (atenção, memória, raciocínio, planejamento, resolução de problemas)
  - Linguagem e comunicação (receptiva, expressiva, pragmática, leitura, escrita)
  - Motor (global, fino, práxis, grafismo)
  - Social e emocional (interação, regulação, autoestima, empatia)
  - Autonomia e vida diária (alimentação, higiene, organização, deslocamento)
  - Acadêmico (Português, Matemática — nível funcional detalhado)
- Seção 4: Barreiras identificadas em alertbox
- Seção 5: Potencialidades e pontos fortes em successbox
- Seção 6: Relação funcionalidade × participação (como as dificuldades impactam a participação escolar)
- Seção 7: Necessidades de apoio (tipo, intensidade, frequência)
- Seção 8: Encaminhamentos e recomendações
- Seção 9: Plano inicial de intervenção (objetivos prioritários)
- Use gráfico/diagrama TikZ de perfil funcional se heat >= 3
- Documento técnico e detalhado — base para o PDI/PEI`,
  },
  "relatorio-bimestral": {
    slug: "relatorio-bimestral",
    name: "Relatório Bimestral",
    instruction: `Gere um RELATÓRIO BIMESTRAL do AEE contendo:
- Dados de identificação do aluno
- Período/bimestre de referência
- Seção 1: Resumo do atendimento (frequência, dias/horários, tipo de atendimento)
- Seção 2: Objetivos trabalhados no bimestre (tabela: objetivo, estratégias, resultado)
- Seção 3: Atividades realizadas (resumo das principais atividades por área)
- Seção 4: Evolução por área de desenvolvimento:
  - Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico
  - Para cada: situação inicial no bimestre → situação final
- Seção 5: Avanços e conquistas em successbox
- Seção 6: Dificuldades persistentes em alertbox
- Seção 7: Articulação com sala regular (reuniões, orientações, adaptações implementadas)
- Seção 8: Articulação com a família (contatos, orientações, devolutivas)
- Seção 9: Objetivos para o próximo bimestre
- Seção 10: Considerações finais
- Tom objetivo e profissional
- Use tabelas comparativas (início × fim do bimestre) se heat >= 3`,
  },
  "relatorio-coordenacao": {
    slug: "relatorio-coordenacao",
    name: "Relatório para Coordenação",
    instruction: `Gere um RELATÓRIO PARA A COORDENAÇÃO PEDAGÓGICA sobre o aluno AEE contendo:
- Tom técnico-administrativo
- Dados de identificação do aluno
- Seção 1: Panorama do atendimento (tipo, frequência, período, professor AEE responsável)
- Seção 2: Diagnóstico e perfil funcional resumido
- Seção 3: Objetivos do plano individual (status: atingido / em progresso / não iniciado)
- Seção 4: Ações realizadas no período (resumo objetivo)
- Seção 5: Resultados e indicadores de progresso
- Seção 6: Articulação com a equipe escolar
  - Reuniões realizadas (datas, participantes, encaminhamentos)
  - Orientações dadas aos professores
  - Adaptações implementadas
- Seção 7: Necessidades identificadas (recursos, formação, suporte)
- Seção 8: Encaminhamentos externos (saúde, assistência social)
- Seção 9: Recomendações para a gestão escolar
- Use tabelas-resumo para objetivos e status
- Documento conciso e focado em dados — a coordenação precisa de visão rápida`,
  },
  "declaracao-atendimento": {
    slug: "declaracao-atendimento",
    name: "Declaração de Atendimento",
    instruction: `Gere uma DECLARAÇÃO DE ATENDIMENTO no AEE contendo:
- Cabeçalho oficial da escola (nome completo, CNPJ, endereço, telefone)
- Título centralizado: "DECLARAÇÃO DE ATENDIMENTO EDUCACIONAL ESPECIALIZADO"
- Corpo do texto em formato de declaração oficial:
  - "Declaramos, para os devidos fins, que o(a) aluno(a) [NOME], nascido(a) em [DATA], matriculado(a) no [ANO/SÉRIE] — Turma [TURMA], turno [TURNO], sob matrícula nº [MATRÍCULA]..."
  - Informar que o aluno é atendido no AEE
  - Frequência e dias de atendimento
  - Diagnóstico (CID) se relevante
  - Professor(a) AEE responsável
- Texto sobre a base legal do AEE (Política Nacional de Educação Especial, Decreto 7.611/2011, Resolução CNE/CEB nº 4/2009)
- Finalidade: "Esta declaração é expedida a pedido do(a) responsável para os fins que se fizerem necessários."
- Local e data
- Espaço para assinaturas (direção + professor AEE)
- Documento formal, curto (1-2 páginas), linguagem oficial`,
  },
  "encaminhamento-profissional": {
    slug: "encaminhamento-profissional",
    name: "Encaminhamento Profissional",
    instruction: `Gere um documento de ENCAMINHAMENTO PROFISSIONAL para aluno do AEE contendo:
- Cabeçalho oficial da escola
- Título: "Encaminhamento para Avaliação/Acompanhamento Profissional"
- Destinatário: "Ao(À) Profissional de [área — ex: Fonoaudiologia, Psicologia, Neurologia, Terapia Ocupacional]"
- Seção 1: Identificação do aluno em datacard
- Seção 2: Motivo do encaminhamento (descrição clara e objetiva das queixas/necessidades observadas)
- Seção 3: Histórico escolar relevante (breve)
- Seção 4: Observações no ambiente escolar:
  - O que foi observado pelo professor AEE e equipe
  - Comportamentos, dificuldades, padrões
  - Há quanto tempo os sinais são observados
- Seção 5: Intervenções já realizadas na escola
  - O que já foi tentado
  - Resultados obtidos
- Seção 6: Hipóteses da equipe escolar (o que a escola suspeita, sem diagnósticar)
- Seção 7: Solicitação específica (o que a escola precisa do profissional — avaliação, parecer, acompanhamento, orientações)
- Tom respeitoso e colaborativo (escola ↔ profissional)
- Espaço para contatos e retorno
- Documento objetivo (2-3 páginas)`,
  },
  "relatorio-transicao": {
    slug: "relatorio-transicao",
    name: "Relatório de Transição de Etapa",
    instruction: `Gere um RELATÓRIO DE TRANSIÇÃO DE ETAPA para aluno AEE contendo:
- Capa profissional
- Título: "Relatório de Transição de Etapa — Atendimento Educacional Especializado"
- Seção 1: Identificação do aluno em datacard (incluir etapa atual e etapa de destino)
- Seção 2: Histórico no AEE (tempo de atendimento, frequência, professores que atenderam)
- Seção 3: Perfil de desenvolvimento atual (avaliação por áreas):
  - Cognitivo, Linguagem, Motor, Social, Emocional, Autonomia, Acadêmico
- Seção 4: Conquistas e progressos ao longo do AEE em successbox
- Seção 5: Necessidades que permanecem em alertbox
- Seção 6: Adaptações e estratégias que funcionaram (para continuidade)
- Seção 7: Adaptações e estratégias que NÃO funcionaram (para evitar repetição)
- Seção 8: Perfil de aprendizagem (como o aluno aprende melhor, canais preferenciais, interesses)
- Seção 9: Recomendações para a nova etapa:
  - Para o professor AEE que receberá o aluno
  - Para os professores da sala regular
  - Para a coordenação
  - Para a família
- Seção 10: Encaminhamentos pendentes (saúde, terapias, avaliações)
- Documento completo e detalhado — é a "passagem de bastão" do aluno`,
  },
  "plano-metas": {
    slug: "plano-metas",
    name: "Plano de Metas SMART",
    instruction: `Gere um PLANO DE METAS SMART completo para AEE contendo:
- Capa profissional com título "Plano de Metas SMART"
- Dados de identificação do aluno em datacard
- Seção de contextualização: diagnóstico, dificuldades e potencialidades
- Explicação breve do método SMART (Específica, Mensurável, Alcançável, Relevante, com Prazo)
- Organização por dimensão de desenvolvimento:
  - Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico
- Para CADA dimensão, gerar tabela com colunas:
  - Meta | Indicador de sucesso | Estratégia/Atividade | Prazo | Status inicial
- As metas devem ser realistas e baseadas no perfil do aluno
- Sugestões de atividades práticas para cada meta
- Se heat >= 3: timeline TikZ visual mostrando as metas organizadas por prazo (curto/médio/longo)
- Se heat >= 4: diagrama TikZ de conexões entre dimensões (como avanço em uma área impacta outra)
- Seção de monitoramento: como e quando reavaliar cada meta
- Seção de critérios de reavaliação e ajuste
- Orientações para família e professores sobre como apoiar cada meta
- Tom profissional e propositivo — foco em possibilidades, não apenas dificuldades`,
  },
  "grafico-evolucao": {
    slug: "grafico-evolucao",
    name: "Gráfico de Evolução do Aluno",
    instruction: `Gere um documento de GRÁFICO DE EVOLUÇÃO DO ALUNO para AEE contendo:
- Capa profissional com título "Relatório de Evolução do Aluno"
- Dados de identificação do aluno em datacard
- Período de avaliação
- IMPORTANTE: Os dados de sessões serão fornecidos no contexto. Use-os fielmente.
- Para cada dimensão avaliada (Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico):
  - Tabela de dados com data da sessão e rating (1-5) usando cores por nível
  - Análise descritiva da tendência (melhora, estabilidade, retrocesso)
  - Recomendações baseadas na tendência
- Se heat >= 3: tabela-resumo visual com ícones (\\cmark, \\starmark) mostrando evolução
- Se heat >= 4: diagrama TikZ timeline mostrando marcos de evolução
- Seção de resumo geral: dimensões com maior avanço, dimensões que precisam de atenção
- Recomendações consolidadas para o próximo período
- Comparação entre início e fim do período para cada dimensão
- Tom analítico e baseado em dados`,
  },
  "relatorio-semestral": {
    slug: "relatorio-semestral",
    name: "Relatório Semestral",
    instruction: `Gere um RELATÓRIO SEMESTRAL do AEE contendo:
- Capa profissional com título "Relatório Semestral do AEE"
- Dados de identificação do aluno
- Período/semestre de referência
- IMPORTANTE: Os dados de sessões serão fornecidos no contexto. Use-os fielmente.
- Seção 1: Panorama do semestre (total de sessões, frequência, tipos de atendimento)
- Seção 2: Objetivos do semestre e status de cada um (tabela: objetivo, estratégia, resultado, status)
- Seção 3: Evolução por área de desenvolvimento ao longo do semestre:
  - Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico
  - Para cada: situação no início do semestre → meio → final
- Seção 4: Atividades e estratégias mais eficazes em successbox
- Seção 5: Dificuldades e desafios persistentes em alertbox
- Seção 6: Articulação com sala regular e equipe escolar
- Seção 7: Articulação com a família
- Seção 8: Encaminhamentos externos realizados
- Seção 9: Metas para o próximo semestre
- Seção 10: Considerações finais
- Se heat >= 3: tabela comparativa início × final do semestre por dimensão
- Se heat >= 4: diagrama TikZ timeline do semestre com marcos relevantes
- Tom profissional, analítico e propositivo`,
  },
  "relatorio-anual": {
    slug: "relatorio-anual",
    name: "Relatório Anual",
    instruction: `Gere um RELATÓRIO ANUAL do AEE contendo:
- Capa profissional com título "Relatório Anual do AEE"
- Sumário (\\tableofcontents)
- Dados de identificação do aluno em datacard
- Ano letivo de referência
- IMPORTANTE: Os dados de sessões serão fornecidos no contexto. Use-os fielmente.
- Seção 1: Panorama do ano (total de sessões, frequência mensal, tipos de atendimento)
- Seção 2: Histórico e diagnóstico (contextualização)
- Seção 3: Objetivos anuais e avaliação de cada um (tabela detalhada)
- Seção 4: Evolução anual por dimensão de desenvolvimento:
  - Cognitivo, Linguagem, Motor, Social, Autonomia, Acadêmico
  - Para cada: evolução trimestral/bimestral ao longo do ano
- Seção 5: Conquistas do ano em successbox
- Seção 6: Dificuldades que permanecem em alertbox
- Seção 7: Estratégias mais eficazes (para continuidade)
- Seção 8: Articulação com equipe escolar (reuniões, orientações)
- Seção 9: Articulação com família (devolutivas, orientações)
- Seção 10: Articulação com profissionais externos (terapias, médicos)
- Seção 11: Recomendações para o próximo ano letivo
- Seção 12: Parecer final do professor AEE
- Se heat >= 3: tabela de evolução anual com cores por nível
- Se heat >= 4: diagrama TikZ timeline anual com marcos e conquistas
- Tom analítico, completo e propositivo — é o documento-síntese do ano`,
  },
};

export function getDocumentTypeConfig(slug: string): DocumentTypeConfig | undefined {
  return DOCUMENT_TYPE_CONFIGS[slug];
}

// ---------------------------------------------------------------------------
// Pro Max Enhancements — injected when qualityMode === "promax"
// ---------------------------------------------------------------------------

export const PRO_MAX_ENHANCEMENTS: Record<string, string> = {
  "anamnese": `MODO PRO MAX — ANAMNESE
Meta: 10-15 páginas, qualidade publicável. Após compilar, chame assess_quality. Target: score ≥ 80.

REGRA ANTI-DESERTO: nunca 20+ linhas de texto sem elemento visual (box, tabela, itemize).

EXEMPLAR de seção excelente (use este nível em TODAS as seções):

\\section{\\faIcon{baby} Desenvolvimento Neuropsicomotor}
O desenvolvimento motor seguiu marcos esperados, com marcha independente aos 13 meses.
\\begin{infobox}[Marcos do Desenvolvimento]
\\begin{tabularx}{\\linewidth}{lXX}
\\rowcolor{aeelightblue} \\textbf{Marco} & \\textbf{Esperado} & \\textbf{Alcançado} \\\\
Sustento cefálico & 3 meses & 3 meses \\\\
\\rowcolor{aeelightblue} Sentou sem apoio & 6 meses & 7 meses \\\\
Primeiras palavras & 12 meses & 24 meses \\\\
\\rowcolor{aeelightblue} Controle esfincteriano & 24-36 meses & 42 meses \\\\
\\end{tabularx}
\\end{infobox}
A linguagem apresentou atraso significativo, motivando a primeira avaliação.
\\begin{alertbox}[Sinais Precoces Identificados]
\\begin{itemize}
\\item Contato visual reduzido desde os 8 meses
\\item Ausência de apontar protodeclarativo aos 14 meses
\\end{itemize}
\\end{alertbox}

DIAGRAMAS TikZ: use tikzpicture com nodes e setas (NÃO pgfplots/axis — causa erros).
ESTRUTURA: Capa TikZ + sumário + 12-15 seções com gestação, desenvolvimento, saúde,
diagnóstico, perfil por dimensão (radar TikZ), família, escolar, comportamento, terapias,
expectativas, considerações. CADA seção com box ou tabela. Mínimo 2 diagramas TikZ.`,

  "estudo-de-caso": `MODO PRO MAX — ESTUDO DE CASO
Meta: 10-15 páginas, qualidade publicável. Após compilar, chame assess_quality. Target: score ≥ 80.

REGRA ANTI-DESERTO: nunca escreva 20+ linhas de texto sem inserir um elemento visual
(infobox, alertbox, successbox, tabela, ou itemize). Intercale texto com boxes a cada parágrafo.

EXEMPLAR de análise por dimensão (use este padrão EXATO em cada dimensão):

\\subsection{\\faIcon{brain} Dimensão Cognitiva}
Pedro demonstra atenção sustentada de 15 min em atividades de interesse. [2-3 linhas de análise]
\\begin{successbox}[Potencialidades Cognitivas]
\\begin{itemize}
\\item Memória visual acima do esperado — reconhece sequências de até 6 elementos
\\item Responde bem a rotinas previsíveis com apoio de agenda visual
\\end{itemize}
\\end{successbox}
[1-2 linhas de transição narrativa]
\\begin{alertbox}[Pontos de Atenção]
Dificuldade com instruções verbais sequenciais (mais de 2 passos).
\\end{alertbox}

DIAGRAMAS: Use tikzpicture com nodes e setas (NÃO pgfplots/axis — causa erros de compilação).
1) Timeline horizontal: nodes com datas importantes (nascimento, diagnóstico, AEE, hoje)
2) Mind map central: node do aluno no centro, 6 nodes dimensionais ao redor com setas

ESTRUTURA: Capa TikZ + sumário + identificação (datacard) + diagnóstico (alertbox) + timeline TikZ
+ CADA dimensão com o padrão acima (texto + successbox + alertbox) + barreiras vs potencialidades
(tabela comparativa) + estratégias + cronograma + orientações (família/equipe).`,

  "pdi": `MODO PRO MAX — PDI
Meta: 8-12 páginas, qualidade publicável. Após compilar, chame assess_quality. Target: score ≥ 80.

REGRA ANTI-DESERTO: nunca 20+ linhas de texto sem elemento visual (box, tabela, itemize).

EXEMPLAR de tabela de metas SMART:

\\subsection{\\faIcon{comments} Linguagem e Comunicação}
\\begin{tealbox}[Metas SMART — Linguagem]
\\begin{tabularx}{\\linewidth}{p{3.5cm}Xp{2cm}p{1.5cm}}
\\rowcolor{aeelightblue} \\textbf{Meta} & \\textbf{Indicador} & \\textbf{Estratégia} & \\textbf{Prazo} \\\\
Ampliar vocabulário funcional para 50 palavras & Registro semanal & Pranchas de CAA & Mar/2026 \\\\
\\rowcolor{aeelightblue} Formar frases de 3 palavras & 80\\% em 3 sessões & Modelagem & Jun/2026 \\\\
\\end{tabularx}
\\end{tealbox}

Metas genuinamente SMART: específicas ao diagnóstico, com indicadores numéricos/observáveis.
Use números reais baseados no perfil do aluno (não genéricos).
DIAGRAMAS TikZ: use tikzpicture com nodes e setas (NÃO pgfplots/axis — causa erros).
1) Cronograma tipo Gantt: nodes retangulares com cores por prioridade
2) Diagrama de conexões: como avanço numa dimensão impacta outras
ESTRUTURA: Capa + sumário + identificação + perfil funcional + metas SMART por dimensão (6 tabelas)
+ cronograma + adaptações curriculares + articulação AEE↔sala regular + indicadores de progresso.`,

  "sugestao-atendimento": `MODO PRO MAX — SUGESTÃO DE ATENDIMENTO
Meta: 12-18 páginas, guia profissional publicável. Após compilar, chame assess_quality. Target: score ≥ 80.

EXEMPLAR de atividade excelente:

\\begin{atividadebox}[aeegreen][\\faIcon{book-open} Leitura Compartilhada Adaptada]
\\objtag[aeeblue]{Linguagem receptiva} \\objtag[aeegreen]{Vocabulário} \\objtag[aeepurple]{Atenção compartilhada}

Leitura mediada com livro de imagens grandes e texto simplificado, focando em nomeação,
antecipação de eventos e turnos comunicativos.

\\textbf{Materiais:} Livro "O Gato Xadrez" (Bia Villela), pranchas de CAA com símbolos
do livro, dado de perguntas (quem/onde/o quê), timer visual de 15 min.

\\textbf{Passo a passo:}
\\begin{enumerate}
\\item Apresentar a capa e pedir que o aluno nomeie o que vê (apoio: prancha CAA)
\\item Ler a primeira página com entonação exagerada, apontando as imagens
\\item Pausar e fazer pergunta do dado: "Quem apareceu?" — esperar 10s
\\item Se não responder, oferecer 2 opções visuais (prancha) para escolha
\\item Continuar a leitura, pedindo que o aluno vire a página (autonomia motora)
\\item A cada 3 páginas, recontar o que aconteceu usando 3 imagens sequenciais
\\item No final, pedir que escolha a parte favorita apontando no livro
\\item Registrar: palavras usadas, nível de apoio, tempo de atenção
\\end{enumerate}

\\textbf{Variações:} \\textit{Nível 1:} apoio total com modelagem; \\textit{Nível 2:} apoio parcial
(dicas visuais); \\textit{Nível 3:} recontar independente com apoio de imagens.
\\end{atividadebox}

Use este nível de detalhe em TODAS as atividades. Mínimo 12 atividades (4 leitura, 3 escrita,
3 socialização, 2 autonomia). Materiais REAIS. 4 semanas de planejamento específico.
DIAGRAMAS TikZ: use tikzpicture com nodes e setas (NÃO pgfplots/axis — causa erros).
1) Mind map de objetivos (aluno no centro, áreas ao redor)
2) Fluxograma horizontal de sessão (Acolhida→Atividade→Complementar→Fechamento)`,

  "parecer-descritivo": `MODO PRO MAX — PARECER DESCRITIVO
Meta: 8-12 páginas, qualidade publicável. Após compilar, chame assess_quality. Target: score ≥ 80.

REGRA ANTI-DESERTO: nunca 20+ linhas de texto sem elemento visual (box, tabela, itemize).

EXEMPLAR de análise por dimensão (use este padrão em CADA dimensão):

\\subsection{\\faIcon{comments} Linguagem e Comunicação}
No início do semestre, Pedro utilizava gestos e vocalizações, com ~15 palavras.
\\begin{successbox}[Avanços no Semestre]
\\begin{itemize}
\\item Vocabulário ampliou de 15 para 38 palavras funcionais
\\item Iniciou frases de 2 palavras ("quero água", "dá bola")
\\item Responde ao nome em 8/10 chamadas (antes: 3/10)
\\end{itemize}
\\end{successbox}
A pragmática permanece prioritária — dificuldade em iniciar interações sem mediação.
\\begin{alertbox}[Aspectos em Desenvolvimento]
Turnos conversacionais limitados a 2 trocas. Manter espera estruturada (10s).
\\end{alertbox}

O parecer deve ser ANALÍTICO com dados concretos (números, datas, frequências).
DIAGRAMA TikZ: use tikzpicture com nodes (NÃO pgfplots/axis). Para o radar, crie um
hexágono com 6 vértices rotulados e 2 polígonos coloridos sobrepostos (antes vs agora).
Tabela comparativa com setas de tendência (\\faIcon{arrow-up}/\\faIcon{arrow-down}/\\faIcon{arrows-alt-h}).
ESTRUTURA: Capa + sumário + identificação + diagnóstico + avaliação por dimensão (CADA uma
com successbox + alertbox) + radar TikZ + acadêmico + comparativo + AEE + recomendações.`,
};
