import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Plus,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface RecentDocument {
  id: string;
  title: string;
  status: string;
  studentId: string;
  studentName: string;
  documentType: string;
  createdAt: string;
}

interface DashboardStats {
  totalStudents: number;
  totalDocuments: number;
  completedDocs: number;
  errorDocs: number;
  recentDocuments: RecentDocument[];
}

export function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardStats>("/dashboard/stats").then((res) => {
      if (res.success && res.data) {
        setStats(res.data);
      }
      setLoading(false);
    });
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Concluído";
      case "error":
        return "Erro";
      default:
        return "Gerando...";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Olá, {user?.name?.split(" ")[0]}!
        </h1>
        <p className="text-muted-foreground">Bem-vindo(a) ao AEE+ PRO</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/alunos">
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Alunos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-8 w-12" /> : stats?.totalStudents ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">cadastrados</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/documentos">
          <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Documentos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-8 w-12" /> : stats?.totalDocuments ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">gerados no total</p>
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? <Skeleton className="h-8 w-12" /> : stats?.completedDocs ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">documentos prontos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Com Erro</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {loading ? <Skeleton className="h-8 w-12" /> : stats?.errorDocs ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">precisam atenção</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button asChild>
          <Link to="/alunos/novo">
            <Plus className="h-4 w-4 mr-1" />
            Novo Aluno
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/alunos">
            <Users className="h-4 w-4 mr-1" />
            Ver Alunos
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/prompts">
            <FileText className="h-4 w-4 mr-1" />
            Prompts
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/configuracoes">
            <Settings className="h-4 w-4 mr-1" />
            Configurações
          </Link>
        </Button>
      </div>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !stats?.recentDocuments.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum documento gerado ainda.</p>
              <p className="text-sm mt-1">
                Cadastre um aluno e gere seu primeiro documento!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  to={`/alunos/${doc.studentId}/documentos/${doc.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  {statusIcon(doc.status)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.studentName} —{" "}
                      {new Date(doc.createdAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <Badge
                    variant={
                      doc.status === "completed"
                        ? "success"
                        : doc.status === "error"
                        ? "destructive"
                        : "warning"
                    }
                    className="shrink-0 text-xs"
                  >
                    {statusLabel(doc.status)}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
