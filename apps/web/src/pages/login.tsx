import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-primary/10 via-background to-accent/30">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm shadow-xl border-0 shadow-primary/10">
        <CardHeader className="text-center">
          <img src="/logo.png" alt="AEE+ PRO" className="h-12 mx-auto mb-2" />
          <CardDescription>Entre com sua conta para continuar</CardDescription>
        </CardHeader>
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
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Sua senha"
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link to="/register" className="text-primary underline">
                Criar conta
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">
        Desenvolvido por{" "}
        <a
          href="https://www.blumenauti.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium"
        >
          Blumenau TI
        </a>
      </p>
    </div>
  );
}
