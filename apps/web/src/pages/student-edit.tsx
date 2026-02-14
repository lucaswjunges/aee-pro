import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Student } from "@aee-pro/shared";
import { StudentForm } from "@/components/students/student-form";
import { api } from "@/lib/api";

export function StudentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<Student>(`/students/${id}`).then((res) => {
      if (res.success && res.data) {
        setStudent(res.data);
      } else {
        navigate("/alunos");
      }
      setLoading(false);
    });
  }, [id, navigate]);

  if (loading) {
    return <p className="text-muted-foreground">Carregando...</p>;
  }

  if (!student) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Editar Aluno</h1>
      <StudentForm student={student} />
    </div>
  );
}
