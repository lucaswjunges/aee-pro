import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkspaceProject } from "@aee-pro/shared";

/**
 * Redirect component: when visiting /alunos/:id/documentos or /alunos/:id/documentos-latex,
 * finds (or creates) the workspace project for this student and redirects to Estúdio.
 */
export function StudentEstudioRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      // Try to find existing project for this student
      const res = await api.get<WorkspaceProject[]>(
        `/workspace/projects?studentId=${id}`
      );

      if (res.success && res.data && res.data.length > 0) {
        navigate(`/estudio/${res.data[0].id}`, { replace: true });
        return;
      }

      // No project found — get student name to create one
      const studentRes = await api.get<{ name: string }>(`/students/${id}`);
      const studentName = studentRes.success && studentRes.data
        ? studentRes.data.name
        : "Aluno";

      // Create new project for this student
      const createRes = await api.post<WorkspaceProject & { conversationId: string }>(
        "/workspace/projects",
        {
          name: `Documentos — ${studentName}`,
          studentId: id,
        }
      );

      if (createRes.success && createRes.data) {
        navigate(`/estudio/${createRes.data.id}`, { replace: true });
      } else {
        setError(createRes.error ?? "Erro ao criar projeto no Estúdio.");
      }
    })();
  }, [id, navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-2">
          <p className="text-destructive">{error}</p>
          <button
            onClick={() => navigate("/estudio", { replace: true })}
            className="text-sm text-primary hover:underline"
          >
            Ir para o Estúdio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">
          Abrindo Estúdio do aluno...
        </p>
      </div>
    </div>
  );
}
