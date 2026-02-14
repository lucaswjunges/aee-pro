import { Link } from "react-router-dom";
import { LogOut, Users, LayoutDashboard, Settings, Menu, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import { useMobile } from "@/hooks/use-mobile";
import { useState } from "react";

export function Header() {
  const { user, logout } = useAuth();
  const isMobile = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        <Link to="/" className="font-bold text-lg">
          AEE+ PRO
        </Link>

        {!isMobile && (
          <nav className="flex items-center gap-1 ml-4">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Painel
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/alunos">
                <Users className="h-4 w-4 mr-1" />
                Alunos
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/prompts">
                <FileText className="h-4 w-4 mr-1" />
                Prompts
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/configuracoes">
                <Settings className="h-4 w-4 mr-1" />
                Configurações
              </Link>
            </Button>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.name}
            </span>
          )}
          <ThemeToggle />
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}
          {!isMobile && (
            <Button variant="ghost" size="icon" onClick={logout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isMobile && menuOpen && (
        <nav className="border-t p-2 flex flex-col gap-1">
          <Button variant="ghost" size="sm" asChild onClick={() => setMenuOpen(false)}>
            <Link to="/">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Painel
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild onClick={() => setMenuOpen(false)}>
            <Link to="/alunos">
              <Users className="h-4 w-4 mr-2" />
              Alunos
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild onClick={() => setMenuOpen(false)}>
            <Link to="/prompts">
              <FileText className="h-4 w-4 mr-2" />
              Prompts
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild onClick={() => setMenuOpen(false)}>
            <Link to="/configuracoes">
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </nav>
      )}
    </header>
  );
}
