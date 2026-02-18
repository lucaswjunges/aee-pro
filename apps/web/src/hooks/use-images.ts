import { useState, useEffect, useCallback } from "react";
import { api, API_BASE } from "@/lib/api";

export interface UserImage {
  id: string;
  filename: string;
  displayName: string;
  category: "builtin" | "uploaded";
  r2Key?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export function useImages() {
  const [images, setImages] = useState<UserImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UserImage[]>("/images");
      if (res.success && res.data) {
        setImages(res.data);
      } else {
        setError(res.error ?? "Erro ao carregar imagens");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar imagens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const uploadImage = useCallback(
    async (file: File, displayName?: string): Promise<UserImage | null> => {
      const formData = new FormData();
      formData.append("file", file);
      if (displayName) {
        formData.append("displayName", displayName);
      }

      // Use raw fetch because api.post always sets Content-Type to application/json
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/images/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();
      if (json.success && json.data) {
        await fetchImages();
        return json.data;
      }
      throw new Error(json.error ?? "Erro ao enviar imagem");
    },
    [fetchImages],
  );

  const deleteImage = useCallback(
    async (id: string) => {
      const res = await api.delete(`/images/${id}`);
      if (res.success) {
        await fetchImages();
      } else {
        throw new Error(res.error ?? "Erro ao deletar imagem");
      }
    },
    [fetchImages],
  );

  const getThumbnailUrl = useCallback((imageId: string) => {
    return `${API_BASE}/images/${imageId}/thumbnail`;
  }, []);

  return {
    images,
    loading,
    error,
    uploadImage,
    deleteImage,
    getThumbnailUrl,
    refetch: fetchImages,
  };
}
