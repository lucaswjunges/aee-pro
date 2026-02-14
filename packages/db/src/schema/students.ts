import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),

  // Identificação
  dateOfBirth: text("date_of_birth"),
  grade: text("grade"),
  school: text("school"),
  shift: text("shift"),
  sexo: text("sexo"),
  turma: text("turma"),
  matricula: text("matricula"),
  profRegular: text("prof_regular"),
  coordenadora: text("coordenadora"),

  // Diagnóstico
  diagnosis: text("diagnosis"),
  diagnosticoCid: text("diagnostico_cid"),
  classificacao: text("classificacao"),
  medicamentos: text("medicamentos"),
  alergias: text("alergias"),
  terapiasAtuais: text("terapias_atuais"),
  historicoMedico: text("historico_medico"),

  // Família
  responsibleName: text("responsible_name"),
  responsiblePhone: text("responsible_phone"),
  responsibleEmail: text("responsible_email"),
  maeNome: text("mae_nome"),
  maeIdade: text("mae_idade"),
  maeProfissao: text("mae_profissao"),
  maeEscolaridade: text("mae_escolaridade"),
  paiNome: text("pai_nome"),
  paiIdade: text("pai_idade"),
  paiProfissao: text("pai_profissao"),
  paiEscolaridade: text("pai_escolaridade"),
  composicaoFamiliar: text("composicao_familiar"),
  endereco: text("endereco"),
  rotinaFamiliar: text("rotina_familiar"),
  comunicacaoCasa: text("comunicacao_casa"),

  // Desenvolvimento
  desenvMotor: text("desenv_motor"),
  desenvLinguagem: text("desenv_linguagem"),
  desenvCognitivo: text("desenv_cognitivo"),
  desenvSocial: text("desenv_social"),
  desenvAutonomia: text("desenv_autonomia"),
  comportamentoEmocional: text("comportamento_emocional"),
  habLeitura: text("hab_leitura"),
  habEscrita: text("hab_escrita"),
  habMatematica: text("hab_matematica"),

  // AEE
  teacherName: text("teacher_name"),
  tipoAtendimento: text("tipo_atendimento"),
  frequencia: text("frequencia"),
  dificuldadesIniciais: text("dificuldades_iniciais"),
  potencialidades: text("potencialidades"),
  barreiras: text("barreiras"),
  necessidadesAcessibilidade: text("necessidades_acessibilidade"),
  expectativasFamilia: text("expectativas_familia"),

  // Outros
  observations: text("observations"),

  // LGPD
  lgpdConsentAt: text("lgpd_consent_at"),
  lgpdConsentBy: text("lgpd_consent_by"),

  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
