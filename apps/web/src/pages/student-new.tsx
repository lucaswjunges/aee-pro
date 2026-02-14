import { StudentForm } from "@/components/students/student-form";

export function StudentNewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Novo Aluno</h1>
      <StudentForm />
    </div>
  );
}
