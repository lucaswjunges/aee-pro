type StudentData = Record<string, string | number | boolean | null | undefined>;

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  dateOfBirth: "Data de nascimento",
  idade: "Idade",
  grade: "Ano/Série",
  school: "Escola",
  shift: "Turno",
  sexo: "Sexo",
  turma: "Turma",
  matricula: "Matrícula",
  profRegular: "Professor(a) do ensino regular",
  coordenadora: "Coordenadora",
  diagnosis: "Diagnóstico",
  diagnosticoCid: "CID",
  classificacao: "Classificação",
  medicamentos: "Medicamentos",
  alergias: "Alergias",
  terapiasAtuais: "Terapias atuais",
  historicoMedico: "Histórico médico",
  responsibleName: "Responsável",
  responsiblePhone: "Telefone do responsável",
  responsibleEmail: "E-mail do responsável",
  maeNome: "Nome da mãe",
  maeIdade: "Idade da mãe",
  maeProfissao: "Profissão da mãe",
  maeEscolaridade: "Escolaridade da mãe",
  paiNome: "Nome do pai",
  paiIdade: "Idade do pai",
  paiProfissao: "Profissão do pai",
  paiEscolaridade: "Escolaridade do pai",
  composicaoFamiliar: "Composição familiar",
  endereco: "Endereço",
  rotinaFamiliar: "Rotina familiar",
  comunicacaoCasa: "Comunicação em casa",
  desenvMotor: "Desenvolvimento motor",
  desenvLinguagem: "Desenvolvimento da linguagem",
  desenvCognitivo: "Desenvolvimento cognitivo",
  desenvSocial: "Desenvolvimento social",
  desenvAutonomia: "Autonomia",
  comportamentoEmocional: "Comportamento emocional",
  habLeitura: "Habilidade de leitura",
  habEscrita: "Habilidade de escrita",
  habMatematica: "Habilidade em matemática",
  teacherName: "Professor(a) AEE",
  tipoAtendimento: "Tipo de atendimento",
  frequencia: "Frequência",
  dificuldadesIniciais: "Dificuldades iniciais",
  potencialidades: "Potencialidades",
  barreiras: "Barreiras",
  necessidadesAcessibilidade: "Necessidades de acessibilidade",
  expectativasFamilia: "Expectativas da família",
  observations: "Observações",
  dataAtual: "Data atual",
};

export function renderPrompt(template: string, student: StudentData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = student[key];
    if (value === null || value === undefined || value === "") {
      return "não informado";
    }
    return String(value);
  });
}

export function buildStudentDataBlock(student: StudentData): string {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const value = student[key];
    const display = value !== null && value !== undefined && value !== ""
      ? String(value)
      : "não informado";
    lines.push(`- ${label}: ${display}`);
  }
  return lines.join("\n");
}
