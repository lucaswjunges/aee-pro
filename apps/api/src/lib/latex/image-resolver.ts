import { eq } from "drizzle-orm";
import { userImages } from "@aee-pro/db/schema";
import type { CompileImage } from "./compiler-client";

/** Built-in gallery mapping (filename → R2 key). */
const BUILTIN_MAP: Record<string, string> = {
  "urso-pelucia.png": "gallery/urso-pelucia.png",
  "estrela-dourada.png": "gallery/estrela-dourada.png",
  "coracao-vermelho.png": "gallery/coracao-vermelho.png",
  "borboleta-colorida.png": "gallery/borboleta-colorida.png",
  "coruja-sabedoria.png": "gallery/coruja-sabedoria.png",
  "livro-aberto.png": "gallery/livro-aberto.png",
  "lapis-colorido.png": "gallery/lapis-colorido.png",
  "nuvem-fofa.png": "gallery/nuvem-fofa.png",
  "arco-iris.png": "gallery/arco-iris.png",
  "flor-jardim.png": "gallery/flor-jardim.png",
  "sol-sorridente.png": "gallery/sol-sorridente.png",
  "abc-letras.png": "gallery/abc-letras.png",
};

/**
 * Extract all \includegraphics{filename} references from LaTeX source.
 * Handles optional arguments like \includegraphics[width=3cm]{filename}.
 */
function extractImageFilenames(latexSource: string): string[] {
  const regex = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
  const filenames = new Set<string>();
  let match;
  while ((match = regex.exec(latexSource)) !== null) {
    filenames.add(match[1].trim());
  }
  return [...filenames];
}

/**
 * Resolve \includegraphics references in LaTeX source to base64 image data from R2.
 *
 * Looks up each referenced filename in:
 * 1. User's uploaded images (user_images table)
 * 2. Built-in gallery (hardcoded mapping)
 *
 * Returns array of CompileImage objects ready to send to the compiler.
 */
export async function resolveImagesFromLatex(
  latexSource: string,
  userId: string,
  db: { select: () => any },
  r2: R2Bucket,
): Promise<CompileImage[]> {
  const filenames = extractImageFilenames(latexSource);
  if (filenames.length === 0) return [];

  // Fetch user's images from DB
  const userImgs = await (db as any)
    .select()
    .from(userImages)
    .where(eq(userImages.userId, userId));

  // Build filename → r2Key map from user images
  const userFileMap = new Map<string, string>();
  for (const img of userImgs) {
    userFileMap.set(img.filename, img.r2Key);
    // Also allow matching by display name or original filename
    userFileMap.set(img.displayName, img.r2Key);
  }

  const resolvedImages: CompileImage[] = [];

  for (const filename of filenames) {
    // Try user images first, then builtin gallery
    const r2Key = userFileMap.get(filename) ?? BUILTIN_MAP[filename];
    if (!r2Key) {
      console.log(`[image-resolver] Imagem não encontrada: ${filename}`);
      continue;
    }

    try {
      const object = await r2.get(r2Key);
      if (!object) {
        console.log(`[image-resolver] R2 object não encontrado: ${r2Key}`);
        continue;
      }

      const buffer = await object.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
      );

      resolvedImages.push({
        filename,
        data_base64: base64,
      });
    } catch (err) {
      console.log(`[image-resolver] Erro ao buscar ${r2Key}:`, err instanceof Error ? err.message : err);
    }
  }

  return resolvedImages;
}
