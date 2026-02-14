const PROMPTS = [
  {
    id: "prompt-anamnese",
    slug: "anamnese",
    name: "Anamnese",
    description: "Anamnese completa para o AEE com histórico escolar, desenvolvimento global, comunicação, socialização, autonomia e expectativas da família.",
    category: "avaliacao",
    sortOrder: 1,
    requiredFields: JSON.stringify(["name", "dateOfBirth", "diagnosis", "grade"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, gere uma ANAMNESE COMPLETA PARA O AEE, com linguagem acessível, profissional e focada nas necessidades educacionais, incluindo:

1. **Dados de Identificação** (nome, idade, série, escola, turno)
2. **Histórico Escolar** (trajetória escolar, escolas anteriores, retenções)
3. **Diagnóstico e Saúde** (CID, classificação, medicamentos, alergias, terapias, histórico médico)
4. **Desenvolvimento Global** (motor, linguagem, cognitivo, social, autonomia, comportamento emocional)
5. **Habilidades Acadêmicas** (leitura, escrita, matemática)
6. **Contexto Familiar** (composição familiar, rotina, comunicação em casa, expectativas)
7. **Socialização e Comunicação** (interação com pares, formas de comunicação)
8. **Considerações Finais e Encaminhamentos**

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Sexo: {{sexo}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Matrícula: {{matricula}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Coordenadora: {{coordenadora}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Alergias: {{alergias}}
- Terapias atuais: {{terapiasAtuais}}
- Histórico médico: {{historicoMedico}}
- Responsável: {{responsibleName}}
- Telefone: {{responsiblePhone}}
- Mãe: {{maeNome}} (idade: {{maeIdade}}, profissão: {{maeProfissao}}, escolaridade: {{maeEscolaridade}})
- Pai: {{paiNome}} (idade: {{paiIdade}}, profissão: {{paiProfissao}}, escolaridade: {{paiEscolaridade}})
- Composição familiar: {{composicaoFamiliar}}
- Endereço: {{endereco}}
- Rotina familiar: {{rotinaFamiliar}}
- Comunicação em casa: {{comunicacaoCasa}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Expectativas da família: {{expectativasFamilia}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis — onde há "não informado", não invente dados, apenas omita ou indique que o dado não foi fornecido.`,
  },
  {
    id: "prompt-estudo-caso",
    slug: "estudo-de-caso",
    name: "Estudo de Caso",
    description: "Estudo de caso para AEE relacionando características do aluno com barreiras de aprendizagem, necessidades educacionais e possibilidades de intervenção.",
    category: "avaliacao",
    sortOrder: 2,
    requiredFields: JSON.stringify(["name", "diagnosis", "dificuldadesIniciais"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, gere um ESTUDO DE CASO PARA AEE, relacionando as características do aluno com as barreiras de aprendizagem, necessidades educacionais específicas e possibilidades de intervenção no AEE.

O documento deve conter:

1. **Identificação do Aluno** (dados pessoais e escolares)
2. **Motivo do Encaminhamento** (por que o aluno foi encaminhado ao AEE)
3. **Histórico** (desenvolvimento, saúde, família)
4. **Avaliação do Desenvolvimento** (motor, linguagem, cognitivo, social, emocional, autonomia)
5. **Desempenho Acadêmico** (leitura, escrita, matemática — pontos fortes e dificuldades)
6. **Análise das Barreiras** (identificação das barreiras de aprendizagem e participação)
7. **Potencialidades e Interesses** (o que o aluno faz bem, seus interesses)
8. **Necessidades Educacionais Específicas** (o que precisa ser trabalhado)
9. **Proposta de Intervenção** (estratégias, recursos, adaptações sugeridas)
10. **Considerações Finais**

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Sexo: {{sexo}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Terapias atuais: {{terapiasAtuais}}
- Histórico médico: {{historicoMedico}}
- Composição familiar: {{composicaoFamiliar}}
- Comunicação em casa: {{comunicacaoCasa}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Expectativas da família: {{expectativasFamilia}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-pdi",
    slug: "pdi",
    name: "PDI - Plano de Desenvolvimento Individual",
    description: "Plano de Desenvolvimento Individual para o AEE com objetivos, estratégias pedagógicas, recursos, adaptações e avaliação.",
    category: "planejamento",
    sortOrder: 3,
    requiredFields: JSON.stringify(["name", "diagnosis", "dificuldadesIniciais", "potencialidades"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um PDI (Plano de Desenvolvimento Individual) PARA O AEE contendo:

1. **Dados de Identificação** (nome, série, escola, professor AEE, diagnóstico)
2. **Objetivo Geral** (meta ampla para o desenvolvimento do aluno no AEE)
3. **Objetivos Específicos** (metas mensuráveis e alcançáveis por área de desenvolvimento)
4. **Habilidades Prioritárias** (as habilidades mais importantes a serem desenvolvidas)
5. **Estratégias Pedagógicas** (atividades e metodologias a serem utilizadas)
6. **Recursos e Adaptações** (materiais, tecnologias assistivas, adaptações curriculares)
7. **Cronograma de Atendimento** (frequência, duração, período)
8. **Avaliação e Acompanhamento** (indicadores de progresso, formas de registro)
9. **Articulação com o Ensino Regular** (como o AEE se integra com a sala regular)

Tudo de forma prática e funcional.

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Sexo: {{sexo}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Terapias atuais: {{terapiasAtuais}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-plano-intervencao",
    slug: "plano-intervencao",
    name: "Plano de Intervenção AEE",
    description: "Plano de intervenção detalhado para o AEE com objetivos, estratégias, atividades, recursos e cronograma de atendimento.",
    category: "planejamento",
    sortOrder: 4,
    requiredFields: JSON.stringify(["name", "diagnosis", "dificuldadesIniciais", "potencialidades"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um PLANO DE INTERVENÇÃO PARA O AEE contendo:

1. **Dados de Identificação** (nome, série, escola, professor AEE, diagnóstico)
2. **Justificativa** (por que este plano é necessário para o aluno)
3. **Objetivos Gerais** (metas amplas de desenvolvimento)
4. **Objetivos Específicos** (metas mensuráveis por área: cognitiva, linguagem, socialização, autonomia, acadêmica)
5. **Estratégias de Intervenção** (metodologias, abordagens pedagógicas, técnicas específicas)
6. **Atividades Propostas** (atividades concretas organizadas por objetivo)
7. **Recursos e Materiais** (materiais pedagógicos, tecnologias assistivas, jogos, materiais sensoriais)
8. **Cronograma** (frequência, duração das sessões, período de vigência do plano)
9. **Articulação** (com professor regente, família, equipe multidisciplinar)
10. **Avaliação e Registro** (indicadores de progresso, instrumentos de avaliação, periodicidade)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Sexo: {{sexo}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Terapias atuais: {{terapiasAtuais}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-adaptacoes-curriculares",
    slug: "adaptacoes-curriculares",
    name: "Adaptações Curriculares",
    description: "Documento de adaptações curriculares com modificações por disciplina, estratégias diferenciadas e adequações de conteúdo.",
    category: "planejamento",
    sortOrder: 5,
    requiredFields: JSON.stringify(["name", "diagnosis", "grade", "dificuldadesIniciais"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um documento de ADAPTAÇÕES CURRICULARES contendo:

1. **Dados de Identificação** (nome, série, escola, professor AEE, professor regente, diagnóstico)
2. **Justificativa** (necessidade das adaptações com base no perfil do aluno)
3. **Adaptações de Acesso** (organização do espaço, mobiliário, recursos de acessibilidade, comunicação alternativa)
4. **Adaptações de Objetivos** (adequação dos objetivos de aprendizagem às possibilidades do aluno)
5. **Adaptações de Conteúdo** (seleção e priorização de conteúdos, nível de complexidade)
6. **Adaptações Metodológicas** (estratégias de ensino diferenciadas, materiais adaptados, tempo ampliado)
7. **Adaptações de Avaliação** (instrumentos, critérios e formas de avaliação diferenciadas)
8. **Adaptações por Área do Conhecimento** (Língua Portuguesa, Matemática, Ciências, etc.)
9. **Orientações ao Professor Regente** (dicas práticas para a sala regular)
10. **Acompanhamento** (periodicidade de revisão das adaptações, indicadores de progresso)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-adaptacao-avaliacoes",
    slug: "adaptacao-avaliacoes",
    name: "Adaptação de Avaliações",
    description: "Orientações detalhadas para adaptação de avaliações escolares, com critérios diferenciados e instrumentos alternativos.",
    category: "planejamento",
    sortOrder: 6,
    requiredFields: JSON.stringify(["name", "diagnosis", "grade", "dificuldadesIniciais"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um documento de ADAPTAÇÃO DE AVALIAÇÕES contendo:

1. **Dados de Identificação** (nome, série, escola, diagnóstico)
2. **Justificativa** (por que o aluno necessita de avaliações adaptadas)
3. **Princípios Norteadores** (avaliação processual, contínua e formativa; acessibilidade)
4. **Adaptações na Forma** (ampliação de fonte, uso de imagens, leitura pelo professor, tempo ampliado, uso de recursos de apoio)
5. **Adaptações no Conteúdo** (redução do número de questões, simplificação dos enunciados, questões de múltipla escolha, questões orais)
6. **Adaptações nos Critérios** (critérios diferenciados de correção, valorização do processo, avaliação qualitativa)
7. **Instrumentos Alternativos** (portfólio, avaliação oral, trabalhos práticos, registros fotográficos, autoavaliação adaptada)
8. **Orientações por Disciplina** (adaptações específicas para Língua Portuguesa, Matemática, etc.)
9. **Orientações aos Professores** (como aplicar, como registrar, como comunicar resultados)
10. **Registro e Acompanhamento** (como documentar o desempenho e evolução)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Autonomia: {{desenvAutonomia}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-diario-bordo",
    slug: "diario-bordo",
    name: "Diário de Bordo",
    description: "Modelo de diário de bordo para registro de atendimentos AEE com atividades realizadas, observações e encaminhamentos.",
    category: "registro",
    sortOrder: 7,
    requiredFields: JSON.stringify(["name", "diagnosis", "tipoAtendimento"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, gere um modelo de DIÁRIO DE BORDO DO AEE para ser preenchido ao longo do semestre, contendo:

1. **Cabeçalho** (nome do aluno, série, escola, professor AEE, diagnóstico, período)
2. **Modelo de Registro Diário** com campos para:
   - Data e horário do atendimento
   - Objetivo da sessão
   - Atividades realizadas (descrição detalhada)
   - Recursos e materiais utilizados
   - Comportamento e participação do aluno
   - Avanços observados
   - Dificuldades encontradas
   - Observações adicionais
   - Encaminhamentos para a próxima sessão
3. **5 Exemplos de Registros Pré-preenchidos** (com atividades adequadas ao perfil do aluno, baseadas nas dificuldades e potencialidades)
4. **Orientações de Preenchimento** (dicas para manter o registro objetivo e útil)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-avancos-retrocessos",
    slug: "avancos-retrocessos",
    name: "Avanços e Retrocessos",
    description: "Relatório de avanços e retrocessos do aluno no AEE, com análise por área de desenvolvimento e recomendações.",
    category: "registro",
    sortOrder: 8,
    requiredFields: JSON.stringify(["name", "diagnosis", "dificuldadesIniciais", "potencialidades"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um relatório de AVANÇOS E RETROCESSOS contendo:

1. **Dados de Identificação** (nome, série, escola, professor AEE, diagnóstico, período avaliado)
2. **Contexto Inicial** (situação do aluno ao iniciar o período, dificuldades e potencialidades identificadas)
3. **Avanços Observados**
   - Área cognitiva (atenção, memória, raciocínio)
   - Área da linguagem (comunicação, vocabulário, expressão)
   - Área acadêmica (leitura, escrita, matemática)
   - Área social (interação, participação, regras sociais)
   - Área da autonomia (independência, autocuidado, organização)
   - Área emocional (regulação, autoestima, motivação)
4. **Retrocessos ou Estagnações** (áreas onde houve dificuldade de progresso, com possíveis causas)
5. **Análise Comparativa** (comparação com os objetivos traçados no PDI/Plano de Intervenção)
6. **Fatores que Contribuíram** (positivos e negativos: frequência, medicação, apoio familiar, mudanças)
7. **Recomendações** (ajustes no plano de intervenção, novas estratégias, encaminhamentos)
8. **Considerações Finais** (perspectivas para o próximo período)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Terapias atuais: {{terapiasAtuais}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-relatorio-familia",
    slug: "relatorio-familia",
    name: "Relatório para Família",
    description: "Relatório informativo para a família sobre o desenvolvimento do aluno no AEE, com linguagem acessível e orientações para casa.",
    category: "relatorio",
    sortOrder: 9,
    requiredFields: JSON.stringify(["name", "diagnosis", "responsibleName"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um RELATÓRIO PARA A FAMÍLIA contendo:

1. **Cabeçalho** (escola, nome do aluno, série, professor AEE, data, destinatário/responsável)
2. **Apresentação** (objetivo do relatório, importância da parceria escola-família)
3. **Sobre o Atendimento AEE** (o que é o AEE, como funciona, frequência e tipo de atendimento do aluno)
4. **Desenvolvimento do Aluno**
   - O que o aluno já consegue fazer (valorizar conquistas e pontos fortes)
   - Áreas em desenvolvimento (o que está sendo trabalhado, sem rótulos negativos)
   - Como o aluno se comporta nos atendimentos (participação, interesse, interação)
5. **Atividades Realizadas** (exemplos de atividades, materiais e estratégias usadas no AEE)
6. **Orientações para Casa** (atividades e atitudes que a família pode adotar para apoiar o desenvolvimento)
7. **Importância da Frequência** (reforçar a importância da assiduidade nos atendimentos)
8. **Canal de Comunicação** (como a família pode entrar em contato, agendar conversas)
9. **Mensagem de Encerramento** (acolhedora, motivadora, valorizando a parceria)

IMPORTANTE: Use linguagem simples, acolhedora e acessível. Evite termos técnicos excessivos. A família precisa entender e se sentir parceira, não julgada.

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Escola: {{school}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- Classificação: {{classificacao}}
- Responsável: {{responsibleName}}
- Telefone: {{responsiblePhone}}
- Composição familiar: {{composicaoFamiliar}}
- Rotina familiar: {{rotinaFamiliar}}
- Comunicação em casa: {{comunicacaoCasa}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Expectativas da família: {{expectativasFamilia}}
- Observações: {{observations}}

Gere o documento de forma clara, acolhedora, profissional e funcional.`,
  },
  {
    id: "prompt-relatorio-professor",
    slug: "relatorio-professor",
    name: "Relatório para Professor Regente",
    description: "Relatório técnico para o professor regente com perfil do aluno, estratégias de sala de aula e orientações de manejo.",
    category: "relatorio",
    sortOrder: 10,
    requiredFields: JSON.stringify(["name", "diagnosis", "profRegular", "dificuldadesIniciais"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um RELATÓRIO PARA O PROFESSOR REGENTE contendo:

1. **Dados de Identificação** (nome, série, turma, escola, diagnóstico, professor AEE)
2. **Perfil do Aluno** (resumo do diagnóstico, características principais, como o aluno aprende melhor)
3. **O que está sendo trabalhado no AEE** (objetivos, estratégias e atividades)
4. **Orientações para a Sala Regular**
   - Posicionamento e organização do espaço
   - Estratégias de comunicação e instrução
   - Adaptações de atividades e materiais
   - Manejo de comportamento
   - Tempo e ritmo de trabalho
5. **Adaptações Sugeridas** (para atividades, avaliações e participação)
6. **Potencialidades a Explorar** (como aproveitar os pontos fortes do aluno na sala regular)
7. **Sinais de Alerta** (comportamentos ou situações que merecem atenção especial)
8. **Articulação AEE-Sala Regular** (como trabalhar em conjunto, troca de informações)
9. **Sugestões de Materiais e Recursos** (que podem ser usados na sala regular)
10. **Considerações Finais**

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Necessidades de acessibilidade: {{necessidadesAcessibilidade}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Use linguagem técnica mas acessível ao professor regente.`,
  },
  {
    id: "prompt-ata-reuniao",
    slug: "ata-reuniao",
    name: "Ata de Reunião",
    description: "Modelo de ata de reunião sobre o aluno (com família, equipe pedagógica ou multidisciplinar) com pauta, discussões e encaminhamentos.",
    category: "registro",
    sortOrder: 11,
    requiredFields: JSON.stringify(["name", "diagnosis", "school"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, gere um modelo de ATA DE REUNIÃO contendo:

1. **Cabeçalho Formal**
   - Nome da escola
   - Data, horário de início e término
   - Local da reunião
   - Assunto: Discussão sobre o aluno [nome]
2. **Participantes** (com espaço para nomes e funções — incluir: professor AEE, professor regente, coordenação, família, equipe multidisciplinar se houver)
3. **Pauta da Reunião** (tópicos a serem discutidos, pré-definidos com base no perfil do aluno)
4. **Registro das Discussões** (modelo com espaço para anotações por tópico da pauta)
5. **Situação Atual do Aluno** (resumo baseado nos dados disponíveis)
6. **Pontos Levantados** (espaço estruturado para registrar contribuições de cada participante)
7. **Decisões Tomadas** (ações decididas em conjunto)
8. **Encaminhamentos** (com responsável e prazo para cada ação)
9. **Próxima Reunião** (data sugerida, pauta preliminar)
10. **Espaço para Assinaturas** (participantes)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Coordenadora: {{coordenadora}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Responsável: {{responsibleName}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. O modelo deve ser prático para preenchimento durante ou após a reunião.`,
  },
  {
    id: "prompt-rotina-visual",
    slug: "rotina-visual",
    name: "Rotina Visual (Descritiva)",
    description: "Descrição detalhada de rotina visual para o aluno, com sequência de atividades, apoios visuais e orientações de uso.",
    category: "planejamento",
    sortOrder: 12,
    requiredFields: JSON.stringify(["name", "diagnosis", "tipoAtendimento"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore uma ROTINA VISUAL DESCRITIVA contendo:

1. **Dados de Identificação** (nome, série, escola, diagnóstico)
2. **Justificativa** (por que a rotina visual é importante para este aluno, com base no diagnóstico e perfil)
3. **Orientações Gerais** (como apresentar a rotina ao aluno, onde fixar, quando revisar)
4. **Rotina do AEE** (sequência de atividades típica de um atendimento, passo a passo)
   - Chegada e acolhimento
   - Revisão da rotina do dia
   - Atividade 1 (descrição, objetivo, materiais)
   - Intervalo/momento de descanso
   - Atividade 2 (descrição, objetivo, materiais)
   - Encerramento e despedida
5. **Rotina da Sala Regular** (sugestão de rotina visual para a sala de aula, adaptada ao aluno)
   - Chegada
   - Roda de conversa / acolhida
   - Atividade dirigida
   - Recreio
   - Atividade de grupo
   - Saída
6. **Apoios Visuais Recomendados** (tipos de imagens, pictogramas, cores, tamanho, material)
7. **Estratégias de Transição** (como ajudar o aluno nas mudanças de atividade)
8. **Orientações para Família** (como usar rotina visual em casa)
9. **Dicas de Confecção** (materiais, plastificação, velcro, quadro magnético)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Escola: {{school}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-agrupamento-alunos",
    slug: "agrupamento-alunos",
    name: "Agrupamento de Alunos",
    description: "Proposta de agrupamento de alunos para atendimento AEE, com critérios, objetivos comuns e atividades para o grupo.",
    category: "planejamento",
    sortOrder: 13,
    requiredFields: JSON.stringify(["name", "diagnosis", "dificuldadesIniciais", "potencialidades"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore uma PROPOSTA DE AGRUPAMENTO PARA O AEE contendo:

1. **Dados do Aluno de Referência** (nome, série, escola, diagnóstico)
2. **Perfil para Agrupamento** (características do aluno que permitem trabalho em grupo)
3. **Critérios de Agrupamento**
   - Faixa etária / série compatível
   - Objetivos de aprendizagem semelhantes
   - Nível de desenvolvimento próximo
   - Habilidades complementares
   - Compatibilidade comportamental
4. **Perfil Ideal dos Demais Alunos do Grupo** (características dos alunos que fariam um bom grupo com este aluno)
5. **Objetivos do Atendimento em Grupo**
   - Objetivos acadêmicos compartilhados
   - Objetivos sociais (interação, cooperação, comunicação)
   - Objetivos de autonomia
6. **Atividades Sugeridas para o Grupo** (atividades que favoreçam a interação e aprendizagem colaborativa)
7. **Organização do Atendimento** (tamanho do grupo, frequência, duração, espaço)
8. **Papel do Professor AEE** (mediação, observação, registro)
9. **Indicadores de Sucesso** (como avaliar se o agrupamento está funcionando)
10. **Observações e Cuidados** (situações que podem dificultar o agrupamento)

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Professor(a) AEE: {{teacherName}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. Adapte o conteúdo aos dados disponíveis.`,
  },
  {
    id: "prompt-parecer-descritivo",
    slug: "parecer-descritivo",
    name: "Parecer Descritivo",
    description: "Parecer descritivo do aluno para fins de registro escolar, com análise do desenvolvimento global e desempenho acadêmico.",
    category: "avaliacao",
    sortOrder: 14,
    requiredFields: JSON.stringify(["name", "diagnosis", "grade"]),
    promptTemplate: `Você é um professor especialista em Atendimento Educacional Especializado (AEE), com base na legislação brasileira, BNCC, educação inclusiva e práticas funcionais.

Com base nos dados do aluno abaixo, elabore um PARECER DESCRITIVO contendo:

1. **Dados de Identificação** (nome, série, turma, escola, turno, professor AEE, professor regente, período avaliado)
2. **Diagnóstico e Contexto** (breve descrição do diagnóstico e contexto do aluno no AEE)
3. **Desenvolvimento Global**
   - Aspecto cognitivo (atenção, memória, raciocínio lógico, resolução de problemas)
   - Aspecto motor (coordenação motora fina e grossa, grafismo)
   - Aspecto da linguagem (comunicação oral e escrita, vocabulário, compreensão)
   - Aspecto social (interação com colegas e adultos, regras de convívio)
   - Aspecto emocional (regulação emocional, autoestima, motivação)
   - Autonomia (independência nas atividades, autocuidado, organização)
4. **Desempenho Acadêmico**
   - Língua Portuguesa (leitura, escrita, interpretação)
   - Matemática (conceitos numéricos, operações, raciocínio)
   - Demais áreas (quando relevante)
5. **Participação no AEE** (frequência, envolvimento, resposta às intervenções)
6. **Avanços do Período** (conquistas observadas)
7. **Aspectos em Desenvolvimento** (o que ainda precisa ser trabalhado)
8. **Estratégias Utilizadas** (o que funcionou, o que precisa ser ajustado)
9. **Recomendações** (para o próximo período, para a família, para a escola)
10. **Considerações Finais**

DADOS DO ALUNO:
- Nome: {{name}}
- Data de nascimento: {{dateOfBirth}}
- Sexo: {{sexo}}
- Ano/Série: {{grade}}
- Turma: {{turma}}
- Escola: {{school}}
- Turno: {{shift}}
- Professor(a) regular: {{profRegular}}
- Professor(a) AEE: {{teacherName}}
- Coordenadora: {{coordenadora}}
- Diagnóstico: {{diagnosis}}
- CID: {{diagnosticoCid}}
- Classificação: {{classificacao}}
- Medicamentos: {{medicamentos}}
- Terapias atuais: {{terapiasAtuais}}
- Desenvolvimento motor: {{desenvMotor}}
- Linguagem: {{desenvLinguagem}}
- Cognitivo: {{desenvCognitivo}}
- Social: {{desenvSocial}}
- Autonomia: {{desenvAutonomia}}
- Comportamento emocional: {{comportamentoEmocional}}
- Leitura: {{habLeitura}}
- Escrita: {{habEscrita}}
- Matemática: {{habMatematica}}
- Tipo de atendimento: {{tipoAtendimento}}
- Frequência: {{frequencia}}
- Dificuldades iniciais: {{dificuldadesIniciais}}
- Potencialidades: {{potencialidades}}
- Barreiras: {{barreiras}}
- Observações: {{observations}}

Gere o documento de forma clara, objetiva, profissional e funcional. O parecer deve ser adequado para registro escolar oficial. Adapte o conteúdo aos dados disponíveis.`,
  },
];

// This is used as a SQL seed. Export the data for use in migration or API seed endpoint.
export { PROMPTS };
