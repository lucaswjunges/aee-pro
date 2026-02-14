import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Política de Privacidade</h1>
      </div>

      <Card>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6 space-y-4">
          <h2 className="text-lg font-semibold">1. Introdução</h2>
          <p>
            O AEE+ PRO ("Aplicativo") é uma ferramenta de apoio pedagógico destinada a
            professores de Atendimento Educacional Especializado (AEE). Esta Política de
            Privacidade descreve como coletamos, usamos, armazenamos e protegemos os dados
            pessoais tratados pelo Aplicativo, em conformidade com a Lei Geral de Proteção
            de Dados Pessoais (Lei nº 13.709/2018 — LGPD).
          </p>

          <h2 className="text-lg font-semibold">2. Dados Coletados</h2>
          <p>O Aplicativo coleta e trata os seguintes dados pessoais:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Dados do professor(a):</strong> nome, e-mail e senha (criptografada).</li>
            <li><strong>Dados dos alunos:</strong> nome, data de nascimento, escola, série, diagnóstico,
            dados familiares, informações de desenvolvimento e dados do atendimento AEE.</li>
          </ul>
          <p>
            <strong>Dados sensíveis (Art. 11, LGPD):</strong> O Aplicativo trata dados sobre
            saúde (diagnóstico, CID, medicamentos, terapias) e dados de crianças/adolescentes
            (Art. 14, LGPD). O tratamento ocorre mediante consentimento específico do responsável
            legal e para finalidade exclusivamente educacional.
          </p>

          <h2 className="text-lg font-semibold">3. Finalidade do Tratamento</h2>
          <p>Os dados são tratados exclusivamente para:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Geração automática de documentos pedagógicos do AEE (Anamnese, PDI, Estudo de Caso, etc.).</li>
            <li>Acompanhamento do desenvolvimento do aluno.</li>
            <li>Exportação de documentos para uso escolar.</li>
          </ul>

          <h2 className="text-lg font-semibold">4. Uso de Inteligência Artificial</h2>
          <p>
            Para gerar documentos, os dados do aluno são enviados a provedores de IA terceirizados
            (OpenAI, Anthropic, Google Gemini ou Groq), conforme configurado pelo professor(a).
            A chave de API é fornecida pelo próprio usuário e armazenada de forma criptografada.
          </p>
          <p>
            Os provedores de IA recebem os dados apenas no momento da geração do documento e não
            armazenam permanentemente os dados enviados em suas APIs de geração de texto.
          </p>

          <h2 className="text-lg font-semibold">5. Armazenamento e Segurança</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Os dados são armazenados em banco de dados Cloudflare D1 com criptografia em trânsito (HTTPS).</li>
            <li>Chaves de API são criptografadas em repouso usando AES-256-GCM.</li>
            <li>Senhas são armazenadas com hash PBKDF2 + salt aleatório.</li>
            <li>O acesso aos dados é restrito ao professor(a) que os cadastrou (isolamento por usuário).</li>
          </ul>

          <h2 className="text-lg font-semibold">6. Consentimento (Art. 14, LGPD)</h2>
          <p>
            O cadastro de cada aluno requer que o professor(a) declare ter obtido o consentimento
            específico do responsável legal, conforme exigido pelo Art. 14 da LGPD para tratamento
            de dados de crianças e adolescentes. A data e responsável pelo consentimento são registrados.
          </p>

          <h2 className="text-lg font-semibold">7. Direitos do Titular</h2>
          <p>
            Conforme a LGPD, o titular dos dados (ou seu responsável legal) tem direito a:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Acesso aos dados pessoais tratados.</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
            <li>Exclusão dos dados pessoais (o professor pode excluir o aluno a qualquer momento).</li>
            <li>Informação sobre o compartilhamento de dados.</li>
            <li>Revogação do consentimento.</li>
          </ul>

          <h2 className="text-lg font-semibold">8. Retenção de Dados</h2>
          <p>
            Os dados são mantidos enquanto o professor(a) mantiver sua conta ativa. Ao excluir um
            aluno, todos os seus dados e documentos associados são permanentemente removidos (cascade delete).
          </p>

          <h2 className="text-lg font-semibold">9. Compartilhamento</h2>
          <p>
            Os dados NÃO são compartilhados com terceiros, exceto com os provedores de IA
            no momento da geração de documentos, conforme descrito na seção 4.
          </p>

          <h2 className="text-lg font-semibold">10. Contato</h2>
          <p>
            Para dúvidas sobre esta política ou para exercer seus direitos como titular de dados,
            entre em contato pelo e-mail disponível nas configurações do Aplicativo.
          </p>

          <p className="text-xs text-muted-foreground mt-6">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
