import { Link } from "react-router-dom";
import { Pencil, Trash2, FileText } from "lucide-react";
import type { Student } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface StudentListProps {
  students: Student[];
  onDelete: (id: string) => void;
}

export function StudentList({ students, onDelete }: StudentListProps) {
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
        <Card key={student.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{student.name}</p>
              <p className="text-sm text-muted-foreground">
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
            <div className="flex gap-1 ml-4 shrink-0">
              <Button variant="ghost" size="icon" asChild title="Documentos">
                <Link to={`/alunos/${student.id}/documentos`}>
                  <FileText className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild title="Editar">
                <Link to={`/alunos/${student.id}/editar`}>
                  <Pencil className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
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
