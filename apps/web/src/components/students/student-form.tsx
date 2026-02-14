import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { Student } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface StudentFormProps {
  student?: Student;
}

function field(student: Student | undefined, key: keyof Student): string {
  return (student?.[key] as string) ?? "";
}

export function StudentForm({ student }: StudentFormProps) {
  const navigate = useNavigate();
  const isEdit = !!student;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lgpdConsent, setLgpdConsent] = useState(!!student?.lgpdConsentAt);

  const [form, setForm] = useState({
    name: field(student, "name"),
    // Identificação
    dateOfBirth: field(student, "dateOfBirth"),
    grade: field(student, "grade"),
    school: field(student, "school"),
    shift: field(student, "shift"),
    sexo: field(student, "sexo"),
    turma: field(student, "turma"),
    matricula: field(student, "matricula"),
    profRegular: field(student, "profRegular"),
    coordenadora: field(student, "coordenadora"),
    // Diagnóstico
    diagnosis: field(student, "diagnosis"),
    diagnosticoCid: field(student, "diagnosticoCid"),
    classificacao: field(student, "classificacao"),
    medicamentos: field(student, "medicamentos"),
    alergias: field(student, "alergias"),
    terapiasAtuais: field(student, "terapiasAtuais"),
    historicoMedico: field(student, "historicoMedico"),
    // Família
    responsibleName: field(student, "responsibleName"),
    responsiblePhone: field(student, "responsiblePhone"),
    responsibleEmail: field(student, "responsibleEmail"),
    maeNome: field(student, "maeNome"),
    maeIdade: field(student, "maeIdade"),
    maeProfissao: field(student, "maeProfissao"),
    maeEscolaridade: field(student, "maeEscolaridade"),
    paiNome: field(student, "paiNome"),
    paiIdade: field(student, "paiIdade"),
    paiProfissao: field(student, "paiProfissao"),
    paiEscolaridade: field(student, "paiEscolaridade"),
    composicaoFamiliar: field(student, "composicaoFamiliar"),
    endereco: field(student, "endereco"),
    rotinaFamiliar: field(student, "rotinaFamiliar"),
    comunicacaoCasa: field(student, "comunicacaoCasa"),
    // Desenvolvimento
    desenvMotor: field(student, "desenvMotor"),
    desenvLinguagem: field(student, "desenvLinguagem"),
    desenvCognitivo: field(student, "desenvCognitivo"),
    desenvSocial: field(student, "desenvSocial"),
    desenvAutonomia: field(student, "desenvAutonomia"),
    comportamentoEmocional: field(student, "comportamentoEmocional"),
    habLeitura: field(student, "habLeitura"),
    habEscrita: field(student, "habEscrita"),
    habMatematica: field(student, "habMatematica"),
    // AEE
    teacherName: field(student, "teacherName"),
    tipoAtendimento: field(student, "tipoAtendimento"),
    frequencia: field(student, "frequencia"),
    dificuldadesIniciais: field(student, "dificuldadesIniciais"),
    potencialidades: field(student, "potencialidades"),
    barreiras: field(student, "barreiras"),
    necessidadesAcessibilidade: field(student, "necessidadesAcessibilidade"),
    expectativasFamilia: field(student, "expectativasFamilia"),
    // Outros
    observations: field(student, "observations"),
  });

  const update = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEdit && !lgpdConsent) {
      setError("O consentimento LGPD do responsável é obrigatório para cadastrar o aluno.");
      return;
    }

    setLoading(true);

    const payload: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(form)) {
      payload[key] = value || null;
    }
    payload.name = form.name; // name is required, never null

    if (!isEdit && lgpdConsent) {
      payload.lgpdConsentAt = new Date().toISOString();
      payload.lgpdConsentBy = form.responsibleName || form.name;
    }

    const res = isEdit
      ? await api.put(`/students/${student!.id}`, payload)
      : await api.post("/students", payload);

    setLoading(false);

    if (res.success) {
      navigate("/alunos");
    } else {
      setError(res.error ?? "Erro ao salvar aluno");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* IDENTIFICAÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Nome completo *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              placeholder="Nome do aluno"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Data de nascimento</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => update("dateOfBirth", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sexo">Sexo</Label>
            <Select
              id="sexo"
              value={form.sexo}
              onChange={(e) => update("sexo", e.target.value)}
            >
              <option value="">Selecione...</option>
              <option value="Masculino">Masculino</option>
              <option value="Feminino">Feminino</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade">Ano/Série</Label>
            <Input
              id="grade"
              value={form.grade}
              onChange={(e) => update("grade", e.target.value)}
              placeholder="Ex: 3º ano"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="turma">Turma</Label>
            <Input
              id="turma"
              value={form.turma}
              onChange={(e) => update("turma", e.target.value)}
              placeholder="Ex: A, B, C"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="school">Escola</Label>
            <Input
              id="school"
              value={form.school}
              onChange={(e) => update("school", e.target.value)}
              placeholder="Nome da escola"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift">Turno</Label>
            <Select
              id="shift"
              value={form.shift}
              onChange={(e) => update("shift", e.target.value)}
            >
              <option value="">Selecione...</option>
              <option value="Matutino">Matutino</option>
              <option value="Vespertino">Vespertino</option>
              <option value="Noturno">Noturno</option>
              <option value="Integral">Integral</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="matricula">Matrícula</Label>
            <Input
              id="matricula"
              value={form.matricula}
              onChange={(e) => update("matricula", e.target.value)}
              placeholder="Número da matrícula"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profRegular">Professor(a) do ensino regular</Label>
            <Input
              id="profRegular"
              value={form.profRegular}
              onChange={(e) => update("profRegular", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="coordenadora">Coordenadora</Label>
            <Input
              id="coordenadora"
              value={form.coordenadora}
              onChange={(e) => update("coordenadora", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* DIAGNÓSTICO */}
      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="diagnosis">Diagnóstico</Label>
            <Textarea
              id="diagnosis"
              value={form.diagnosis}
              onChange={(e) => update("diagnosis", e.target.value)}
              placeholder="Descrição do diagnóstico..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diagnosticoCid">CID</Label>
            <Input
              id="diagnosticoCid"
              value={form.diagnosticoCid}
              onChange={(e) => update("diagnosticoCid", e.target.value)}
              placeholder="Ex: F84.0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="classificacao">Classificação</Label>
            <Input
              id="classificacao"
              value={form.classificacao}
              onChange={(e) => update("classificacao", e.target.value)}
              placeholder="Ex: TEA Nível 1, TDAH, DI..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medicamentos">Medicamentos</Label>
            <Input
              id="medicamentos"
              value={form.medicamentos}
              onChange={(e) => update("medicamentos", e.target.value)}
              placeholder="Medicamentos em uso"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alergias">Alergias</Label>
            <Input
              id="alergias"
              value={form.alergias}
              onChange={(e) => update("alergias", e.target.value)}
              placeholder="Alergias conhecidas"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terapiasAtuais">Terapias atuais</Label>
            <Input
              id="terapiasAtuais"
              value={form.terapiasAtuais}
              onChange={(e) => update("terapiasAtuais", e.target.value)}
              placeholder="Fonoaudiologia, TO, psicologia..."
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="historicoMedico">Histórico médico</Label>
            <Textarea
              id="historicoMedico"
              value={form.historicoMedico}
              onChange={(e) => update("historicoMedico", e.target.value)}
              placeholder="Histórico médico relevante..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* FAMÍLIA */}
      <Card>
        <CardHeader>
          <CardTitle>Família</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="responsibleName">Responsável principal</Label>
            <Input
              id="responsibleName"
              value={form.responsibleName}
              onChange={(e) => update("responsibleName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responsiblePhone">Telefone</Label>
            <Input
              id="responsiblePhone"
              value={form.responsiblePhone}
              onChange={(e) => update("responsiblePhone", e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="responsibleEmail">E-mail do responsável</Label>
            <Input
              id="responsibleEmail"
              type="email"
              value={form.responsibleEmail}
              onChange={(e) => update("responsibleEmail", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Mãe</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maeNome">Nome da mãe</Label>
            <Input
              id="maeNome"
              value={form.maeNome}
              onChange={(e) => update("maeNome", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maeIdade">Idade</Label>
            <Input
              id="maeIdade"
              value={form.maeIdade}
              onChange={(e) => update("maeIdade", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maeProfissao">Profissão</Label>
            <Input
              id="maeProfissao"
              value={form.maeProfissao}
              onChange={(e) => update("maeProfissao", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maeEscolaridade">Escolaridade</Label>
            <Input
              id="maeEscolaridade"
              value={form.maeEscolaridade}
              onChange={(e) => update("maeEscolaridade", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Pai</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paiNome">Nome do pai</Label>
            <Input
              id="paiNome"
              value={form.paiNome}
              onChange={(e) => update("paiNome", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paiIdade">Idade</Label>
            <Input
              id="paiIdade"
              value={form.paiIdade}
              onChange={(e) => update("paiIdade", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paiProfissao">Profissão</Label>
            <Input
              id="paiProfissao"
              value={form.paiProfissao}
              onChange={(e) => update("paiProfissao", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paiEscolaridade">Escolaridade</Label>
            <Input
              id="paiEscolaridade"
              value={form.paiEscolaridade}
              onChange={(e) => update("paiEscolaridade", e.target.value)}
            />
          </div>

          <div className="sm:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Contexto familiar</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="composicaoFamiliar">Composição familiar</Label>
            <Textarea
              id="composicaoFamiliar"
              value={form.composicaoFamiliar}
              onChange={(e) => update("composicaoFamiliar", e.target.value)}
              placeholder="Com quem o aluno mora..."
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Input
              id="endereco"
              value={form.endereco}
              onChange={(e) => update("endereco", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="rotinaFamiliar">Rotina familiar</Label>
            <Textarea
              id="rotinaFamiliar"
              value={form.rotinaFamiliar}
              onChange={(e) => update("rotinaFamiliar", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="comunicacaoCasa">Comunicação em casa</Label>
            <Textarea
              id="comunicacaoCasa"
              value={form.comunicacaoCasa}
              onChange={(e) => update("comunicacaoCasa", e.target.value)}
              placeholder="Como o aluno se comunica em casa..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* DESENVOLVIMENTO */}
      <Card>
        <CardHeader>
          <CardTitle>Desenvolvimento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="desenvMotor">Motor</Label>
            <Textarea
              id="desenvMotor"
              value={form.desenvMotor}
              onChange={(e) => update("desenvMotor", e.target.value)}
              placeholder="Coordenação motora fina e grossa..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desenvLinguagem">Linguagem</Label>
            <Textarea
              id="desenvLinguagem"
              value={form.desenvLinguagem}
              onChange={(e) => update("desenvLinguagem", e.target.value)}
              placeholder="Comunicação verbal/não-verbal..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desenvCognitivo">Cognitivo</Label>
            <Textarea
              id="desenvCognitivo"
              value={form.desenvCognitivo}
              onChange={(e) => update("desenvCognitivo", e.target.value)}
              placeholder="Atenção, memória, raciocínio..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desenvSocial">Social</Label>
            <Textarea
              id="desenvSocial"
              value={form.desenvSocial}
              onChange={(e) => update("desenvSocial", e.target.value)}
              placeholder="Interação social, amizades..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desenvAutonomia">Autonomia</Label>
            <Textarea
              id="desenvAutonomia"
              value={form.desenvAutonomia}
              onChange={(e) => update("desenvAutonomia", e.target.value)}
              placeholder="Nível de independência nas atividades..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comportamentoEmocional">Comportamento emocional</Label>
            <Textarea
              id="comportamentoEmocional"
              value={form.comportamentoEmocional}
              onChange={(e) => update("comportamentoEmocional", e.target.value)}
              placeholder="Regulação emocional, comportamentos..."
              rows={2}
            />
          </div>

          <div className="sm:col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Habilidades acadêmicas</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="habLeitura">Leitura</Label>
            <Textarea
              id="habLeitura"
              value={form.habLeitura}
              onChange={(e) => update("habLeitura", e.target.value)}
              placeholder="Nível de leitura, dificuldades..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="habEscrita">Escrita</Label>
            <Textarea
              id="habEscrita"
              value={form.habEscrita}
              onChange={(e) => update("habEscrita", e.target.value)}
              placeholder="Nível de escrita, dificuldades..."
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="habMatematica">Matemática</Label>
            <Textarea
              id="habMatematica"
              value={form.habMatematica}
              onChange={(e) => update("habMatematica", e.target.value)}
              placeholder="Nível em matemática, dificuldades..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* AEE */}
      <Card>
        <CardHeader>
          <CardTitle>AEE - Atendimento Educacional Especializado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="teacherName">Professor(a) AEE</Label>
            <Input
              id="teacherName"
              value={form.teacherName}
              onChange={(e) => update("teacherName", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipoAtendimento">Tipo de atendimento</Label>
            <Input
              id="tipoAtendimento"
              value={form.tipoAtendimento}
              onChange={(e) => update("tipoAtendimento", e.target.value)}
              placeholder="Individual, em grupo..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="frequencia">Frequência</Label>
            <Input
              id="frequencia"
              value={form.frequencia}
              onChange={(e) => update("frequencia", e.target.value)}
              placeholder="Ex: 2x por semana, 1h por sessão"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dificuldadesIniciais">Dificuldades iniciais</Label>
            <Textarea
              id="dificuldadesIniciais"
              value={form.dificuldadesIniciais}
              onChange={(e) => update("dificuldadesIniciais", e.target.value)}
              placeholder="Principais dificuldades identificadas..."
              rows={3}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="potencialidades">Potencialidades</Label>
            <Textarea
              id="potencialidades"
              value={form.potencialidades}
              onChange={(e) => update("potencialidades", e.target.value)}
              placeholder="Pontos fortes e habilidades do aluno..."
              rows={3}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="barreiras">Barreiras</Label>
            <Textarea
              id="barreiras"
              value={form.barreiras}
              onChange={(e) => update("barreiras", e.target.value)}
              placeholder="Barreiras de aprendizagem identificadas..."
              rows={3}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="necessidadesAcessibilidade">Necessidades de acessibilidade</Label>
            <Textarea
              id="necessidadesAcessibilidade"
              value={form.necessidadesAcessibilidade}
              onChange={(e) => update("necessidadesAcessibilidade", e.target.value)}
              placeholder="Recursos de acessibilidade necessários..."
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="expectativasFamilia">Expectativas da família</Label>
            <Textarea
              id="expectativasFamilia"
              value={form.expectativasFamilia}
              onChange={(e) => update("expectativasFamilia", e.target.value)}
              placeholder="O que a família espera do atendimento..."
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="observations">Observações gerais</Label>
            <Textarea
              id="observations"
              value={form.observations}
              onChange={(e) => update("observations", e.target.value)}
              rows={3}
              placeholder="Observações adicionais sobre o aluno..."
            />
          </div>
        </CardContent>
      </Card>

      {/* LGPD CONSENT */}
      {!isEdit && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader>
            <CardTitle className="text-amber-700 dark:text-amber-400">Consentimento LGPD</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), Art. 14,
              o tratamento de dados pessoais de crianças e adolescentes requer consentimento
              específico do responsável legal. Os dados serão utilizados exclusivamente para
              fins educacionais no Atendimento Educacional Especializado (AEE).
            </p>
            <p className="text-sm text-muted-foreground">
              Os dados poderão ser enviados a provedores de IA (conforme configurado) para
              geração de documentos pedagógicos. Consulte nossa{" "}
              <Link to="/privacidade" className="underline text-primary" target="_blank">
                Política de Privacidade
              </Link>{" "}
              para mais detalhes.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={lgpdConsent}
                onChange={(e) => setLgpdConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium">
                Declaro que obtive o consentimento do responsável legal para o tratamento
                dos dados pessoais deste aluno conforme a LGPD.
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      {isEdit && student?.lgpdConsentAt && (
        <p className="text-xs text-muted-foreground">
          Consentimento LGPD registrado em{" "}
          {new Date(student.lgpdConsentAt).toLocaleDateString("pt-BR")}{" "}
          por {student.lgpdConsentBy ?? "responsável"}.
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="outline" onClick={() => navigate("/alunos")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || (!isEdit && !lgpdConsent)}>
          {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Cadastrar Aluno"}
        </Button>
      </div>
    </form>
  );
}
