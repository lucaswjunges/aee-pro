import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, CheckCircle, AlertCircle, Clock, ArrowRight } from "lucide-react";
import type { Document, Student } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive"; icon: typeof CheckCircle }> = {
  completed: { label: "Concluído", variant: "success", icon: CheckCircle },
  generating: { label: "Gerando...", variant: "warning", icon: Clock },
  error: { label: "Erro", variant: "destructive", icon: AlertCircle },
};

export function AllDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [students, setStudents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<Document[]>("/documents"),
      api.get<Student[]>("/students"),
    ]).then(([docsRes, studentsRes]) => {
      if (docsRes.success && docsRes.data) setDocuments(docsRes.data);
      if (studentsRes.success && studentsRes.data) {
        const map: Record<string, string> = {};
        for (const s of studentsRes.data) map[s.id] = s.name;
        setStudents(map);
      }
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Todos os Documentos</h1>
          <p className="text-muted-foreground text-sm">
            {loading ? "Carregando..." : `${documents.length} documento${documents.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhum documento gerado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const status = statusConfig[doc.status] ?? statusConfig.error;
            const StatusIcon = status.icon;
            const studentName = students[doc.studentId] ?? "Aluno removido";

            return (
              <Link
                key={doc.id}
                to={`/alunos/${doc.studentId}/documentos/${doc.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors"
              >
                <StatusIcon className={`h-4 w-4 shrink-0 ${
                  doc.status === "completed" ? "text-green-600" :
                  doc.status === "error" ? "text-red-500" : "text-yellow-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {studentName} —{" "}
                    {new Date(doc.createdAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge variant={status.variant} className="shrink-0 text-xs">
                  {status.label}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
