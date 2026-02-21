import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { AIProviderType } from "@aee-pro/shared";
import { AI_PROVIDERS } from "@aee-pro/shared";

export function SettingsPage() {
  const { user } = useAuth();

  // Profile
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileEmail, setProfileEmail] = useState(user?.email ?? "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; error: boolean } | null>(null);

  // AI Settings
  const [aiProvider, setAiProvider] = useState<AIProviderType | "">("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(8000);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ aiProvider: string | null; aiApiKeyMasked: string | null; aiModel: string | null; maxOutputTokens: number | null }>("/settings").then((res) => {
      if (res.success && res.data) {
        setAiProvider((res.data.aiProvider as AIProviderType) || "");
        setAiApiKeyMasked(res.data.aiApiKeyMasked);
        setAiModel(res.data.aiModel || "");
        setMaxOutputTokens(res.data.maxOutputTokens ?? 8000);
      }
    });
  }, []);

  const handleProfileSave = async () => {
    setProfileLoading(true);
    setProfileMsg(null);
    const res = await api.put("/settings/profile", { name: profileName, email: profileEmail });
    setProfileLoading(false);
    setProfileMsg(res.success ? "Perfil atualizado!" : (res.error ?? "Erro ao atualizar"));
  };

  const handlePasswordChange = async () => {
    setPwMsg(null);
    if (!currentPassword) {
      setPwMsg({ text: "Informe a senha atual", error: true });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ text: "Nova senha deve ter pelo menos 6 caracteres", error: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ text: "As senhas não coincidem", error: true });
      return;
    }
    setPwLoading(true);
    const res = await api.put<{ message: string }>("/settings/password", {
      currentPassword,
      newPassword,
    });
    setPwLoading(false);
    if (res.success) {
      setPwMsg({ text: res.data?.message ?? "Senha alterada com sucesso!", error: false });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPwMsg({ text: res.error ?? "Erro ao alterar senha", error: true });
    }
  };

  const handleAiSave = async () => {
    setAiLoading(true);
    setAiMsg(null);
    const payload: Record<string, string | number | null> = {
      aiProvider: aiProvider || null,
      aiModel: aiModel || null,
      maxOutputTokens,
    };
    if (aiApiKey) {
      payload.aiApiKey = aiApiKey;
    }
    const res = await api.put("/settings", payload);
    setAiLoading(false);
    if (res.success) {
      setAiMsg("Configurações de IA salvas!");
      setAiApiKey("");
      // refresh masked key
      const r = await api.get<{ aiApiKeyMasked: string | null }>("/settings");
      if (r.success && r.data) setAiApiKeyMasked(r.data.aiApiKeyMasked);
    } else {
      setAiMsg(res.error ?? "Erro ao salvar");
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestMsg(null);
    const res = await api.post<{ message: string }>("/settings/test-connection", {});
    setTestLoading(false);
    setTestMsg(res.success ? (res.data?.message ?? "Sucesso!") : (res.error ?? "Falha na conexão"));
  };

  const providerModels = aiProvider ? AI_PROVIDERS[aiProvider]?.models ?? [] : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profileName">Nome</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profileEmail">E-mail</Label>
              <Input
                id="profileEmail"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
              />
            </div>
          </div>
          {profileMsg && (
            <p className="text-sm text-muted-foreground">{profileMsg}</p>
          )}
          <Button onClick={handleProfileSave} disabled={profileLoading}>
            {profileLoading ? "Salvando..." : "Salvar Perfil"}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle>Alterar Senha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.error ? "text-destructive" : "text-muted-foreground"}`}>
              {pwMsg.text}
            </p>
          )}
          <Button onClick={handlePasswordChange} disabled={pwLoading}>
            {pwLoading ? "Alterando..." : "Alterar Senha"}
          </Button>
        </CardContent>
      </Card>

      {/* AI Config */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aiProvider">Provider</Label>
              <Select
                id="aiProvider"
                value={aiProvider}
                onChange={(e) => {
                  const val = e.target.value as AIProviderType | "";
                  setAiProvider(val);
                  if (val) {
                    setAiModel(AI_PROVIDERS[val].defaultModel);
                  } else {
                    setAiModel("");
                  }
                }}
              >
                <option value="">Selecione...</option>
                {Object.entries(AI_PROVIDERS).map(([key, p]) => (
                  <option key={key} value={key}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aiModel">Modelo</Label>
              <Select
                id="aiModel"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                disabled={!aiProvider}
              >
                <option value="">Selecione...</option>
                {providerModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxOutputTokens">Máximo de tokens de saída</Label>
            <Input
              id="maxOutputTokens"
              type="number"
              min={1000}
              max={32000}
              step={1000}
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Controla o tamanho máximo dos documentos gerados. Padrão: 8000. Aumente se os documentos ficarem incompletos; reduza para economizar créditos de API.
            </p>
          </div>
          {aiProvider && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-1">
              <p className="text-sm text-muted-foreground">
                {AI_PROVIDERS[aiProvider].apiKeyHint}
              </p>
              <a
                href={AI_PROVIDERS[aiProvider].apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Obter chave de API
              </a>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="aiApiKey">Chave de API</Label>
            <Input
              id="aiApiKey"
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={aiApiKeyMasked ? `Atual: ${aiApiKeyMasked}` : "Cole sua chave de API aqui"}
            />
            <p className="text-xs text-muted-foreground">
              Sua chave é criptografada e armazenada de forma segura.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleAiSave} disabled={aiLoading}>
              {aiLoading ? "Salvando..." : "Salvar Configurações de IA"}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testLoading || !aiProvider}
            >
              {testLoading ? "Testando..." : "Testar Conexão"}
            </Button>
          </div>
          {aiMsg && <p className="text-sm text-muted-foreground">{aiMsg}</p>}
          {testMsg && <p className="text-sm text-muted-foreground">{testMsg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
