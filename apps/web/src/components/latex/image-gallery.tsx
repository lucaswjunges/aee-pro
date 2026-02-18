import { useState, useRef, useEffect } from "react";
import { Upload, Trash2, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { useImages, type UserImage } from "@/hooks/use-images";
import { API_BASE } from "@/lib/api";

/** Emoji map for built-in stickers (used as preview since images aren't in R2 yet). */
const BUILTIN_EMOJI: Record<string, string> = {
  "urso-pelucia.png": "\u{1F9F8}",
  "estrela-dourada.png": "\u2B50",
  "coracao-vermelho.png": "\u2764\uFE0F",
  "borboleta-colorida.png": "\u{1F98B}",
  "coruja-sabedoria.png": "\u{1F989}",
  "livro-aberto.png": "\u{1F4D6}",
  "lapis-colorido.png": "\u270F\uFE0F",
  "nuvem-fofa.png": "\u2601\uFE0F",
  "arco-iris.png": "\u{1F308}",
  "flor-jardim.png": "\u{1F33B}",
  "sol-sorridente.png": "\u2600\uFE0F",
  "abc-letras.png": "\u{1F524}",
};

interface ImageGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectImage: (filename: string, displayName: string) => void;
}

/** Fetch an image thumbnail with auth header, return object URL. */
function useAuthThumbnail(imageId: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId) return;
    let revoked = false;
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/images/${imageId}/thumbnail`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        setUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId]);

  return url;
}

function UploadedImageCard({
  img,
  onSelect,
  onDelete,
  deleting,
}: {
  img: UserImage;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const thumbUrl = useAuthThumbnail(img.id);

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className="flex flex-col items-center gap-1 rounded-lg border p-2 hover:bg-accent transition-colors cursor-pointer w-full"
        title={img.displayName}
      >
        <div className="w-12 h-12 flex items-center justify-center bg-muted rounded overflow-hidden">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={img.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <span className="text-[10px] text-center line-clamp-2 leading-tight">
          {img.displayName}
        </span>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        disabled={deleting}
        className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remover"
      >
        {deleting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

export function ImageGallery({ open, onOpenChange, onSelectImage }: ImageGalleryProps) {
  const { images, loading, error, uploadImage, deleteImage, refetch } = useImages();
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builtinImages = images.filter((img) => img.category === "builtin");
  const uploadedImages = images.filter((img) => img.category === "uploaded");

  const handleSelect = (img: UserImage) => {
    onSelectImage(img.filename, img.displayName);
    onOpenChange(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      await uploadImage(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro ao enviar imagem");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteImage(id);
    } catch {
      // ignore
    }
    setDeletingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Figurinhas e Imagens</DialogTitle>
        <DialogDescription>
          Escolha uma figurinha ou envie sua imagem para usar no documento.
        </DialogDescription>
      </DialogHeader>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={refetch}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Built-in gallery */}
          <div>
            <h3 className="text-sm font-medium mb-2">Galeria de Figurinhas</h3>
            <p className="text-[10px] text-muted-foreground mb-2">
              Figurinhas decorativas para enfeitar documentos.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {builtinImages.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleSelect(img)}
                  className="flex flex-col items-center gap-1 rounded-lg border p-2 hover:bg-accent transition-colors cursor-pointer"
                  title={img.displayName}
                >
                  <div className="w-12 h-12 flex items-center justify-center rounded text-2xl">
                    {BUILTIN_EMOJI[img.filename] ?? "🖼️"}
                  </div>
                  <span className="text-[10px] text-center line-clamp-2 leading-tight">
                    {img.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Uploaded images */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Minhas Imagens</h3>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>

            {uploadError && (
              <p className="text-xs text-destructive mb-2">{uploadError}</p>
            )}

            {uploadedImages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Nenhuma imagem enviada ainda. Clique em "Enviar" para adicionar.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {uploadedImages.map((img) => (
                  <UploadedImageCard
                    key={img.id}
                    img={img}
                    onSelect={() => handleSelect(img)}
                    onDelete={() => handleDelete(img.id)}
                    deleting={deletingId === img.id}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Formatos aceitos: PNG, JPG, WebP. Tamanho máximo: 2MB.
          </p>
        </div>
      )}
    </Dialog>
  );
}
