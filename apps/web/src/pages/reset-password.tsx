import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { api } from "@/lib/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center space-y-4">
            <p className="text-destructive text-sm">Link inválido. Solicite um novo link de redefinição.</p>
            <Button asChild variant="outline">
              <Link to="/esqueci-minha-senha">Solicitar novo link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    const res = await api.post("/auth/reset-password", { token, password });
    setLoading(false);

    if (res.success) {
      setDone(true);
      setTimeout(() => navigate("/login"), 3000);
    } else {
      setError(res.error ?? "Erro ao redefinir senha. O link pode ter expirado.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/30">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm shadow-xl border-0 shadow-primary/10">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="AEE+ PRO" className="h-12 mx-auto mb-2" />
          <CardTitle className="text-lg">Nova senha</CardTitle>
          <CardDescription>Digite e confirme sua nova senha.</CardDescription>
        </CardHeader>
        {done ? (
          <CardContent className="space-y-4 text-center">
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-sm text-green-800 dark:text-green-300">
              Senha redefinida com sucesso! Redirecionando para o login...
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar nova senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </Button>
              <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Voltar ao login
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
