import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

interface PdfViewerProps {
  documentId: string;
  className?: string;
}

export function PdfViewer({ documentId, className }: PdfViewerProps) {
  const token = localStorage.getItem("token");
  const pdfUrl = `${API_BASE}/latex-documents/${documentId}/pdf`;

  return (
    <div className={className}>
      {token ? (
        <PdfIframe url={pdfUrl} token={token} />
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Faça login para visualizar o PDF.
        </div>
      )}
    </div>
  );
}

function PdfIframe({ url, token }: { url: string; token: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load PDF");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Carregando PDF...
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Erro ao carregar o PDF.
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      className="w-full h-full rounded border-0"
      title="PDF Preview"
    />
  );
}
