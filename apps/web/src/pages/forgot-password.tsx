import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { api } from "@/lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await api.post("/auth/forgot-password", { email });
    setLoading(false);
    if (res.success) {
      setSent(true);
    } else {
      setError(res.error ?? "Erro ao enviar e-mail. Tente novamente.");
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
          <CardTitle className="text-lg">Esqueci minha senha</CardTitle>
          <CardDescription>
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </CardDescription>
        </CardHeader>
        {sent ? (
          <CardContent className="space-y-4 text-center">
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-sm text-green-800 dark:text-green-300">
              Se este e-mail estiver cadastrado, você receberá as instruções em breve. Verifique também a pasta de spam.
            </div>
            <Button asChild variant="outline" className="w-full mt-2">
              <Link to="/login">Voltar ao login</Link>
            </Button>
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
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  autoComplete="email"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar link de redefinição"}
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
