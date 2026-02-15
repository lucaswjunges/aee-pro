import { useEffect, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";

interface PdfViewerProps {
  documentId: string;
  className?: string;
}

/**
 * Mobile browsers (Android Chrome, most WebViews) can't render PDFs inside
 * iframes. We detect this and show open/download buttons instead.
 */
function canEmbedPdf(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav: Record<string, unknown> = navigator as never;
  // navigator.pdfViewerEnabled is the standard API (Chrome 94+, Firefox 99+, Safari 16.4+)
  if (typeof nav.pdfViewerEnabled === "boolean") {
    return nav.pdfViewerEnabled;
  }
  // Fallback heuristic: desktop browsers generally can, mobile generally can't
  return !/Android|iPhone|iPad|iPod/i.test(String(nav.userAgent ?? ""));
}

export function PdfViewer({ documentId, className }: PdfViewerProps) {
  const token = localStorage.getItem("token");
  const pdfUrl = `${API_BASE}/latex-documents/${documentId}/pdf`;

  if (!token) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Faça login para visualizar o PDF.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <PdfContent url={pdfUrl} token={token} />
    </div>
  );
}

function PdfContent({ url, token }: { url: string; token: string }) {
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
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
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

  // Desktop: embed in iframe
  if (canEmbedPdf()) {
    return (
      <iframe
        src={blobUrl}
        className="w-full h-full rounded border-0"
        title="PDF Preview"
      />
    );
  }

  // Mobile: show action buttons
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 rounded-lg border border-dashed text-center">
      <p className="text-muted-foreground text-sm">
        Toque para visualizar o PDF no navegador.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => window.open(blobUrl, "_blank")}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Visualizar PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const a = window.document.createElement("a");
            a.href = blobUrl;
            a.download = "documento.pdf";
            a.click();
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Baixar
        </Button>
      </div>
    </div>
  );
}
