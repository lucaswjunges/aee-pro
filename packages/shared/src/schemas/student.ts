import { z } from "zod";

const nullableText = z.string().nullable().optional();

export const studentSchema = z.object({
  name: z.string().min(2, "Nome do aluno deve ter pelo menos 2 caracteres"),

  // Identificação
  dateOfBirth: nullableText,
  grade: nullableText,
  school: nullableText,
  shift: z.enum(["Matutino", "Vespertino", "Noturno", "Integral"]).nullable().optional(),
  sexo: z.enum(["Masculino", "Feminino"]).nullable().optional(),
  turma: nullableText,
  matricula: nullableText,
  profRegular: nullableText,
  coordenadora: nullableText,

  // Diagnóstico
  diagnosis: nullableText,
  diagnosticoCid: nullableText,
  classificacao: nullableText,
  medicamentos: nullableText,
  alergias: nullableText,
  terapiasAtuais: nullableText,
  historicoMedico: nullableText,

  // Família
  responsibleName: nullableText,
  responsiblePhone: nullableText,
  responsibleEmail: z.string().email("E-mail inválido").nullable().optional().or(z.literal("")),
  maeNome: nullableText,
  maeIdade: nullableText,
  maeProfissao: nullableText,
  maeEscolaridade: nullableText,
  paiNome: nullableText,
  paiIdade: nullableText,
  paiProfissao: nullableText,
  paiEscolaridade: nullableText,
  composicaoFamiliar: nullableText,
  endereco: nullableText,
  rotinaFamiliar: nullableText,
  comunicacaoCasa: nullableText,

  // Desenvolvimento
  desenvMotor: nullableText,
  desenvLinguagem: nullableText,
  desenvCognitivo: nullableText,
  desenvSocial: nullableText,
  desenvAutonomia: nullableText,
  comportamentoEmocional: nullableText,
  habLeitura: nullableText,
  habEscrita: nullableText,
  habMatematica: nullableText,

  // AEE
  teacherName: nullableText,
  tipoAtendimento: nullableText,
  frequencia: nullableText,
  dificuldadesIniciais: nullableText,
  potencialidades: nullableText,
  barreiras: nullableText,
  necessidadesAcessibilidade: nullableText,
  expectativasFamilia: nullableText,

  // Outros
  observations: nullableText,

  // LGPD
  lgpdConsentAt: nullableText,
  lgpdConsentBy: nullableText,
});

export const studentUpdateSchema = studentSchema.partial();

export type StudentInput = z.infer<typeof studentSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
