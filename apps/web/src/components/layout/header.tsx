import { Link, useLocation } from "react-router-dom";
import { LogOut, Users, LayoutDashboard, Settings, Menu, X, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/auth";
import { useMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/estudio", label: "Estúdio", icon: Sparkles },
  { to: "/alunos", label: "Alunos", icon: Users },
  { to: "/prompts", label: "Prompts", icon: FileText },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Header() {
  const { user, logout } = useAuth();
  const isMobile = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-primary text-primary-foreground shadow-md">
      <div className="flex h-14 items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="AEE+ PRO" className="h-14 rounded" />
        </Link>

        {!isMobile && (
          <nav className="flex items-center gap-1 ml-4">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive(item.to)
                    ? "bg-white/20 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {user && (
            <span className="text-sm text-white/70 hidden sm:inline">
              {user.name}
            </span>
          )}
          <ThemeToggle />
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={logout}
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isMobile && menuOpen && (
        <nav className="border-t border-white/10 p-2 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => { setMenuOpen(false); logout(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </nav>
      )}
    </header>
  );
}
