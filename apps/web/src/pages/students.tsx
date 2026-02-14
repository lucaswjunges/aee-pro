import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
import type { Student } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudentList } from "@/components/students/student-list";
import { api } from "@/lib/api";

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadStudents = useCallback(async () => {
    const res = await api.get<Student[]>("/students");
    if (res.success && res.data) {
      setStudents(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleDelete = async (id: string) => {
    const res = await api.delete(`/students/${id}`);
    if (res.success) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const term = search.toLowerCase().trim();
    return students.filter((s) =>
      s.name.toLowerCase().includes(term) ||
      s.school?.toLowerCase().includes(term) ||
      s.diagnosis?.toLowerCase().includes(term) ||
      s.grade?.toLowerCase().includes(term)
    );
  }, [students, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alunos</h1>
        <Button asChild>
          <Link to="/alunos/novo">
            <Plus className="h-4 w-4 mr-1" />
            Novo Aluno
          </Link>
        </Button>
      </div>

      {!loading && students.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, escola, série ou diagnóstico..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : search && filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Nenhum aluno encontrado para "{search}"</p>
          <button
            onClick={() => setSearch("")}
            className="mt-2 text-primary underline"
          >
            Limpar pesquisa
          </button>
        </div>
      ) : (
        <StudentList students={filtered} onDelete={handleDelete} />
      )}
    </div>
  );
}
