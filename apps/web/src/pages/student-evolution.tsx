import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  TrendingUp,
  ClipboardList,
  FileText,
  FileCode,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Student } from "@aee-pro/shared";
import { DIMENSION_RATINGS, RATING_SCALE } from "@aee-pro/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

const DIMENSION_COLORS: Record<string, string> = {
  ratingCognitive: "#3b82f6",
  ratingLinguistic: "#8b5cf6",
  ratingMotor: "#f59e0b",
  ratingSocial: "#10b981",
  ratingAutonomy: "#ec4899",
  ratingAcademic: "#06b6d4",
};

interface DimensionPoint {
  date: string;
  rating: number;
}

interface DimensionSummary {
  label: string;
  average: number | null;
  count: number;
  trend: string;
}

interface EvolutionData {
  totalSessions: number;
  ratedSessions: number;
  dimensions: Record<string, DimensionPoint[]>;
  summary: Record<string, DimensionSummary>;
}

type PeriodFilter = "30" | "60" | "90" | "bimestre" | "semestre" | "all";

function getDateRange(filter: PeriodFilter): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (filter === "all") return {};

  let from: Date;
  switch (filter) {
    case "30":
      from = new Date(now.getTime() - 30 * 86400000);
      break;
    case "60":
      from = new Date(now.getTime() - 60 * 86400000);
      break;
    case "90":
      from = new Date(now.getTime() - 90 * 86400000);
      break;
    case "bimestre":
      from = new Date(now.getTime() - 60 * 86400000);
      break;
    case "semestre":
      from = new Date(now.getTime() - 180 * 86400000);
      break;
    default:
      return {};
  }
  return { from: from.toISOString().slice(0, 10), to };
}

function formatDateShort(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

const TREND_ICONS: Record<string, string> = {
  melhora: "↑",
  retrocesso: "↓",
  estável: "→",
  "sem dados": "—",
};

const TREND_COLORS: Record<string, string> = {
  melhora: "text-green-600 dark:text-green-400",
  retrocesso: "text-red-600 dark:text-red-400",
  estável: "text-yellow-600 dark:text-yellow-400",
  "sem dados": "text-muted-foreground",
};

export function StudentEvolutionPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [data, setData] = useState<EvolutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>("semestre");

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const { from, to } = getDateRange(period);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const [studentRes, evoRes] = await Promise.all([
      api.get<Student>(`/students/${id}`),
      api.get<EvolutionData>(`/evolution/${id}?${params.toString()}`),
    ]);

    if (studentRes.success && studentRes.data) setStudent(studentRes.data);
    if (evoRes.success && evoRes.data) setData(evoRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id, period]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Aluno não encontrado.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/alunos">Voltar para Alunos</Link>
        </Button>
      </div>
    );
  }

  // Build chart data: merge all dimensions by date
  const chartData: Record<string, Record<string, number | string>>[] = [];
  if (data) {
    const allDates = new Set<string>();
    for (const dim of DIMENSION_RATINGS) {
      for (const point of data.dimensions[dim.key] ?? []) {
        allDates.add(point.date);
      }
    }
    const sortedDates = [...allDates].sort();
    for (const date of sortedDates) {
      const entry: Record<string, number | string> = { date: formatDateShort(date) };
      for (const dim of DIMENSION_RATINGS) {
        const point = (data.dimensions[dim.key] ?? []).find((p) => p.date === date);
        if (point) entry[dim.key] = point.rating;
      }
      chartData.push(entry);
    }
  }

  const hasChartData = chartData.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mt-0.5">
          <Link to="/alunos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">Evolução</h1>
          <p className="text-muted-foreground truncate">{student.name}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b overflow-x-auto">
        <Link
          to={`/alunos/${id}/sessoes`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <ClipboardList className="h-4 w-4" />
          Sessões
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary whitespace-nowrap">
          <TrendingUp className="h-4 w-4" />
          Evolução
        </div>
        <Link
          to={`/alunos/${id}/documentos`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <FileText className="h-4 w-4" />
          Documentos Texto
        </Link>
        <Link
          to={`/alunos/${id}/documentos-latex`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent whitespace-nowrap"
        >
          <FileCode className="h-4 w-4" />
          Documentos LaTeX
        </Link>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "30", label: "30 dias" },
            { value: "60", label: "60 dias" },
            { value: "90", label: "90 dias" },
            { value: "bimestre", label: "Bimestre" },
            { value: "semestre", label: "Semestre" },
            { value: "all", label: "Tudo" },
          ] as const
        ).map((opt) => (
          <Button
            key={opt.value}
            variant={period === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Stats */}
      {data && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{data.totalSessions} sessões no período</span>
          <span>{data.ratedSessions} com avaliação</span>
        </div>
      )}

      {/* Chart */}
      {hasChartData ? (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Evolução por Dimensão
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis
                domain={[1, 5]}
                ticks={[1, 2, 3, 4, 5]}
                tick={{ fontSize: 12 }}
                tickFormatter={(v: number) => RATING_SCALE.find((s) => s.value === v)?.label.split(" ")[0] ?? String(v)}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const dim = DIMENSION_RATINGS.find((d) => d.key === name);
                  const scale = RATING_SCALE.find((s) => s.value === value);
                  return [`${value} — ${scale?.label ?? ""}`, dim?.label ?? name];
                }}
              />
              <Legend
                formatter={(value: string) =>
                  DIMENSION_RATINGS.find((d) => d.key === value)?.label ?? value
                }
              />
              {DIMENSION_RATINGS.map((dim) => (
                <Line
                  key={dim.key}
                  type="monotone"
                  dataKey={dim.key}
                  stroke={DIMENSION_COLORS[dim.key]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma avaliação por dimensão encontrada no período.</p>
          <p className="text-sm mt-1">Registre sessões com avaliação por dimensão para ver a evolução.</p>
        </div>
      )}

      {/* Summary table */}
      {data && Object.values(data.summary).some((s) => s.count > 0) && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium mb-3">Resumo por Dimensão</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Dimensão</th>
                  <th className="pb-2 font-medium text-center">Avaliações</th>
                  <th className="pb-2 font-medium text-center">Média</th>
                  <th className="pb-2 font-medium text-center">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {DIMENSION_RATINGS.map((dim) => {
                  const s = data.summary[dim.key];
                  if (!s || s.count === 0) return null;
                  return (
                    <tr key={dim.key} className="border-b last:border-0">
                      <td className="py-2 flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: DIMENSION_COLORS[dim.key] }}
                        />
                        {dim.label}
                      </td>
                      <td className="py-2 text-center">{s.count}</td>
                      <td className="py-2 text-center">{s.average?.toFixed(1) ?? "—"}</td>
                      <td className={`py-2 text-center font-medium ${TREND_COLORS[s.trend]}`}>
                        {TREND_ICONS[s.trend]} {s.trend}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
