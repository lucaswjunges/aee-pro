import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { userImages } from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import type { Env } from "../index";

type ImagesEnv = Env & {
  Variables: {
    userId: string;
  };
};

export const imageRoutes = new Hono<ImagesEnv>();

imageRoutes.use("*", authMiddleware);

/** Built-in gallery stickers available to all users. */
const BUILTIN_GALLERY = [
  { filename: "urso-pelucia.png", displayName: "Urso de Pelúcia", r2Key: "gallery/urso-pelucia.png" },
  { filename: "estrela-dourada.png", displayName: "Estrela Dourada", r2Key: "gallery/estrela-dourada.png" },
  { filename: "coracao-vermelho.png", displayName: "Coração Vermelho", r2Key: "gallery/coracao-vermelho.png" },
  { filename: "borboleta-colorida.png", displayName: "Borboleta Colorida", r2Key: "gallery/borboleta-colorida.png" },
  { filename: "coruja-sabedoria.png", displayName: "Coruja da Sabedoria", r2Key: "gallery/coruja-sabedoria.png" },
  { filename: "livro-aberto.png", displayName: "Livro Aberto", r2Key: "gallery/livro-aberto.png" },
  { filename: "lapis-colorido.png", displayName: "Lápis Colorido", r2Key: "gallery/lapis-colorido.png" },
  { filename: "nuvem-fofa.png", displayName: "Nuvem Fofa", r2Key: "gallery/nuvem-fofa.png" },
  { filename: "arco-iris.png", displayName: "Arco-Íris", r2Key: "gallery/arco-iris.png" },
  { filename: "flor-jardim.png", displayName: "Flor do Jardim", r2Key: "gallery/flor-jardim.png" },
  { filename: "sol-sorridente.png", displayName: "Sol Sorridente", r2Key: "gallery/sol-sorridente.png" },
  { filename: "abc-letras.png", displayName: "Letras ABC", r2Key: "gallery/abc-letras.png" },
];

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

// ---------- GET / — list user images (builtin + uploaded) ----------

imageRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const uploaded = await db
    .select()
    .from(userImages)
    .where(eq(userImages.userId, userId));

  // Combine builtin gallery with user-uploaded images
  const builtinItems = BUILTIN_GALLERY.map((g) => ({
    id: `builtin:${g.filename}`,
    filename: g.filename,
    displayName: g.displayName,
    category: "builtin" as const,
    r2Key: g.r2Key,
    mimeType: "image/png",
    sizeBytes: 0,
  }));

  return c.json({
    success: true,
    data: [...builtinItems, ...uploaded],
  });
});

// ---------- GET /gallery — list only built-in stickers ----------

imageRoutes.get("/gallery", async (c) => {
  return c.json({
    success: true,
    data: BUILTIN_GALLERY.map((g) => ({
      id: `builtin:${g.filename}`,
      filename: g.filename,
      displayName: g.displayName,
      category: "builtin" as const,
    })),
  });
});

// ---------- POST /upload — upload user image ----------

imageRoutes.post("/upload", async (c) => {
  const userId = c.get("userId");

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return c.json({ success: false, error: "Arquivo não enviado" }, 400);
  }

  // file is a File/Blob from FormData
  const uploadFile = file as unknown as File;

  if (!ALLOWED_MIME_TYPES.includes(uploadFile.type)) {
    return c.json(
      { success: false, error: `Tipo de arquivo não suportado: ${uploadFile.type}. Use PNG, JPG ou WebP.` },
      400,
    );
  }

  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    return c.json(
      { success: false, error: `Arquivo muito grande (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB). Máximo: 2MB.` },
      400,
    );
  }

  const displayName = formData.get("displayName")?.toString() || uploadFile.name.replace(/\.[^.]+$/, "");
  const id = crypto.randomUUID();
  const ext = uploadFile.name.split(".").pop()?.toLowerCase() || "png";
  const safeFilename = `${id}.${ext}`;
  const r2Key = `user-images/${userId}/${safeFilename}`;

  const buffer = await uploadFile.arrayBuffer();
  await c.env.R2.put(r2Key, buffer, {
    httpMetadata: { contentType: uploadFile.type },
  });

  const db = createDb(c.env.DB);
  await db.insert(userImages).values({
    id,
    userId,
    filename: safeFilename,
    displayName,
    category: "uploaded",
    r2Key,
    mimeType: uploadFile.type,
    sizeBytes: uploadFile.size,
    createdAt: new Date().toISOString(),
  });

  const created = await db
    .select()
    .from(userImages)
    .where(eq(userImages.id, id))
    .get();

  return c.json({ success: true, data: created }, 201);
});

// ---------- DELETE /:id — delete uploaded image ----------

imageRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const db = createDb(c.env.DB);

  const img = await db
    .select()
    .from(userImages)
    .where(and(eq(userImages.id, id), eq(userImages.userId, userId)))
    .get();

  if (!img) {
    return c.json({ success: false, error: "Imagem não encontrada" }, 404);
  }

  if (img.category === "builtin") {
    return c.json({ success: false, error: "Não é possível deletar imagens da galeria" }, 400);
  }

  await c.env.R2.delete(img.r2Key).catch(() => {});
  await db.delete(userImages).where(eq(userImages.id, id));

  return c.json({ success: true });
});

// ---------- GET /:id/thumbnail — serve image for preview ----------

imageRoutes.get("/:id/thumbnail", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  let r2Key: string;
  let mimeType = "image/png";

  // Check if it's a builtin image
  if (id.startsWith("builtin:")) {
    const filename = id.replace("builtin:", "");
    const builtin = BUILTIN_GALLERY.find((g) => g.filename === filename);
    if (!builtin) {
      return c.json({ success: false, error: "Imagem não encontrada" }, 404);
    }
    r2Key = builtin.r2Key;
  } else {
    const db = createDb(c.env.DB);
    const img = await db
      .select()
      .from(userImages)
      .where(and(eq(userImages.id, id), eq(userImages.userId, userId)))
      .get();
    if (!img) {
      return c.json({ success: false, error: "Imagem não encontrada" }, 404);
    }
    r2Key = img.r2Key;
    mimeType = img.mimeType;
  }

  const object = await c.env.R2.get(r2Key);
  if (!object) {
    return c.json({ success: false, error: "Imagem não encontrada no armazenamento" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", mimeType);
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(object.body, { headers });
});
