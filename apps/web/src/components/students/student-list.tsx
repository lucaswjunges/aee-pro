import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import type { Student } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const avatarColors = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

interface StudentListProps {
  students: Student[];
  onDelete: (id: string) => void;
}

export function StudentList({ students, onDelete }: StudentListProps) {
  const navigate = useNavigate();

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Nenhum aluno cadastrado ainda.</p>
        <p className="mt-2">
          <Link to="/alunos/novo" className="text-primary underline">
            Cadastre o primeiro aluno
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {students.map((student) => (
        <Card
          key={student.id}
          className="cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all"
          onClick={() => navigate(`/alunos/${student.id}/documentos`)}
        >
          <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
            <div
              className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${getColorClass(student.name)}`}
            >
              {getInitials(student.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{student.name}</p>
              <p className="text-sm text-muted-foreground truncate">
                {[student.grade, student.school, student.shift]
                  .filter(Boolean)
                  .join(" - ") || "Sem detalhes"}
              </p>
              {student.diagnosis && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {student.diagnosis}
                </p>
              )}
            </div>
            <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Editar">
                <Link to={`/alunos/${student.id}/editar`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Excluir"
                onClick={() => {
                  if (window.confirm(`Tem certeza que deseja excluir ${student.name}?`)) {
                    onDelete(student.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
