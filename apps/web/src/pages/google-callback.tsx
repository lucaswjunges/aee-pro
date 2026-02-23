import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMsg("Autorização negada pelo Google.");
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMsg("Código de autorização ausente.");
      return;
    }

    api
      .post<{ connected: boolean }>("/workspace/drive/callback", { code })
      .then((res) => {
        if (res.success) {
          setStatus("success");
          setTimeout(() => navigate("/estudio", { replace: true }), 1500);
        } else {
          setStatus("error");
          setErrorMsg(res.error ?? "Erro ao conectar Google Drive.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Erro de rede ao conectar.");
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Conectando ao Google Drive...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-medium">Google Drive conectado!</p>
            <p className="text-sm text-muted-foreground">Redirecionando...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="font-medium text-destructive">Falha na conexão</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => navigate("/estudio", { replace: true })}
              className="text-sm text-primary hover:underline"
            >
              Voltar ao Estúdio
            </button>
          </>
        )}
      </div>
    </div>
  );
}
