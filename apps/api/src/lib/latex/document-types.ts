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
    instruction: `Gere uma SUGESTÃO DE ATENDIMENTO AEE completa contendo:
- Capa profissional
- Perfil do aluno e objetivos (diagrama TikZ se heat >= 3)
- Estrutura padrão das sessões (fluxo visual TikZ se heat >= 3)
- Banco de atividades por área com atividadebox:
  - Leitura e consciência fonológica (3+ atividades)
  - Escrita (2+ atividades)
  - Socialização e comunicação (2+ atividades)
  - Autonomia e rotina (2+ atividades)
  Cada atividade: descrição, materiais, passo a passo, tempo, variações
- Sessaobox com planejamento semanal (4 semanas)
- Indicadores de progresso e metas mensuráveis
- Ficha de registro de sessão
- Recursos gratuitos recomendados
- Mind map do perfil do aluno (se heat >= 4)`,
  },
};

export function getDocumentTypeConfig(slug: string): DocumentTypeConfig | undefined {
  return DOCUMENT_TYPE_CONFIGS[slug];
}
