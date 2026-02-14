export interface Student {
  id: string;
  userId: string;
  name: string;

  // Identificação
  dateOfBirth: string | null;
  grade: string | null;
  school: string | null;
  shift: string | null;
  sexo: string | null;
  turma: string | null;
  matricula: string | null;
  profRegular: string | null;
  coordenadora: string | null;

  // Diagnóstico
  diagnosis: string | null;
  diagnosticoCid: string | null;
  classificacao: string | null;
  medicamentos: string | null;
  alergias: string | null;
  terapiasAtuais: string | null;
  historicoMedico: string | null;

  // Família
  responsibleName: string | null;
  responsiblePhone: string | null;
  responsibleEmail: string | null;
  maeNome: string | null;
  maeIdade: string | null;
  maeProfissao: string | null;
  maeEscolaridade: string | null;
  paiNome: string | null;
  paiIdade: string | null;
  paiProfissao: string | null;
  paiEscolaridade: string | null;
  composicaoFamiliar: string | null;
  endereco: string | null;
  rotinaFamiliar: string | null;
  comunicacaoCasa: string | null;

  // Desenvolvimento
  desenvMotor: string | null;
  desenvLinguagem: string | null;
  desenvCognitivo: string | null;
  desenvSocial: string | null;
  desenvAutonomia: string | null;
  comportamentoEmocional: string | null;
  habLeitura: string | null;
  habEscrita: string | null;
  habMatematica: string | null;

  // AEE
  teacherName: string | null;
  tipoAtendimento: string | null;
  frequencia: string | null;
  dificuldadesIniciais: string | null;
  potencialidades: string | null;
  barreiras: string | null;
  necessidadesAcessibilidade: string | null;
  expectativasFamilia: string | null;

  // Outros
  observations: string | null;

  // LGPD
  lgpdConsentAt: string | null;
  lgpdConsentBy: string | null;

  createdAt: string;
  updatedAt: string;
}

export type StudentCreate = Omit<Student, "id" | "userId" | "createdAt" | "updatedAt">;
export type StudentUpdate = Partial<StudentCreate>;
