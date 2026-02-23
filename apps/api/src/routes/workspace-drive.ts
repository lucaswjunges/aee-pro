import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import {
  userSettings,
  workspaceFiles,
  workspaceFileVersions,
  workspaceProjects,
} from "@aee-pro/db/schema";
import { createDb } from "../db/index";
import { authMiddleware } from "../middleware/auth";
import { encrypt, decrypt } from "../lib/encryption";
import type { Env } from "../index";

type DriveEnv = Env & {
  Variables: { userId: string };
  Bindings: Env["Bindings"] & {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
};

export const workspaceDriveRoutes = new Hono<DriveEnv>();
workspaceDriveRoutes.use("*", authMiddleware);

// ---------- GET /drive/status — check if Google Drive is connected ----------

workspaceDriveRoutes.get("/drive/status", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.googleRefreshTokenEncrypted) {
    return c.json({ success: true, data: { connected: false } });
  }

  return c.json({ success: true, data: { connected: true } });
});

// ---------- GET /drive/auth-url — get Google OAuth URL ----------

workspaceDriveRoutes.get("/drive/auth-url", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json(
      { success: false, error: "Google Drive não configurado no servidor." },
      501
    );
  }

  const redirectUri = `${c.env.FRONTEND_URL}/estudio/google-callback`;
  const scope = "https://www.googleapis.com/auth/drive.file";

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return c.json({ success: true, data: { url: url.toString() } });
});

// ---------- POST /drive/callback — exchange auth code for tokens ----------

workspaceDriveRoutes.post("/drive/callback", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ code: string }>();
  const db = createDb(c.env.DB);

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.json(
      { success: false, error: "Google Drive não configurado." },
      501
    );
  }

  const redirectUri = `${c.env.FRONTEND_URL}/estudio/google-callback`;

  // Exchange auth code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: body.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json(
      { success: false, error: `Erro ao conectar Google: ${err}` },
      400
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + tokens.expires_in * 1000
  ).toISOString();

  const accessEncrypted = await encrypt(
    tokens.access_token,
    c.env.SESSION_SECRET
  );
  const refreshEncrypted = tokens.refresh_token
    ? await encrypt(tokens.refresh_token, c.env.SESSION_SECRET)
    : null;

  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (existing) {
    await db
      .update(userSettings)
      .set({
        googleAccessTokenEncrypted: accessEncrypted,
        googleRefreshTokenEncrypted:
          refreshEncrypted || existing.googleRefreshTokenEncrypted,
        googleTokenExpiresAt: expiresAt,
        updatedAt: now.toISOString(),
      })
      .where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values({
      id: crypto.randomUUID(),
      userId,
      googleAccessTokenEncrypted: accessEncrypted,
      googleRefreshTokenEncrypted: refreshEncrypted,
      googleTokenExpiresAt: expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return c.json({ success: true, data: { connected: true } });
});

// ---------- POST /drive/disconnect — remove Google tokens ----------

workspaceDriveRoutes.post("/drive/disconnect", async (c) => {
  const userId = c.get("userId");
  const db = createDb(c.env.DB);

  await db
    .update(userSettings)
    .set({
      googleAccessTokenEncrypted: null,
      googleRefreshTokenEncrypted: null,
      googleTokenExpiresAt: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userSettings.userId, userId));

  return c.json({ success: true });
});

// ---------- POST /drive/save — save file to Google Drive ----------

workspaceDriveRoutes.post("/drive/save", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ fileId: string; folderName?: string }>();
  const db = createDb(c.env.DB);

  // Get Google access token
  const accessToken = await getValidAccessToken(userId, db, c.env);
  if (!accessToken) {
    return c.json(
      { success: false, error: "Conecte o Google Drive primeiro." },
      401
    );
  }

  // Get workspace file
  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, body.fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado." }, 404);
  }

  // Read file from R2
  const object = await c.env.R2.get(file.r2Key);
  if (!object) {
    return c.json({ success: false, error: "Conteúdo não encontrado." }, 404);
  }

  const fileContent = await object.arrayBuffer();
  const fileName = file.path.split("/").pop() || "document";

  // Find or create folder in Drive
  let folderId: string | undefined;
  if (body.folderName) {
    folderId = await findOrCreateDriveFolder(
      body.folderName,
      accessToken
    );
  }

  // Upload to Google Drive
  const metadata: Record<string, unknown> = {
    name: fileName,
    mimeType: file.mimeType,
  };
  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = "----AEEProBoundary" + crypto.randomUUID().slice(0, 8);
  const metadataPart = JSON.stringify(metadata);

  const bodyParts = [
    `--${boundary}\r\n`,
    `Content-Type: application/json; charset=UTF-8\r\n\r\n`,
    `${metadataPart}\r\n`,
    `--${boundary}\r\n`,
    `Content-Type: ${file.mimeType}\r\n\r\n`,
  ];

  const headerBytes = new TextEncoder().encode(bodyParts.join(""));
  const footerBytes = new TextEncoder().encode(`\r\n--${boundary}--`);

  const combined = new Uint8Array(
    headerBytes.byteLength + fileContent.byteLength + footerBytes.byteLength
  );
  combined.set(headerBytes, 0);
  combined.set(new Uint8Array(fileContent), headerBytes.byteLength);
  combined.set(footerBytes, headerBytes.byteLength + fileContent.byteLength);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return c.json(
      { success: false, error: `Erro ao salvar no Drive: ${err}` },
      500
    );
  }

  const result = (await uploadRes.json()) as { id: string; name: string };

  return c.json({
    success: true,
    data: {
      driveFileId: result.id,
      fileName: result.name,
      message: `Arquivo "${fileName}" salvo no Google Drive!`,
    },
  });
});

// ---------- File versioning endpoints ----------

// GET /files/:fileId/versions — list versions
workspaceDriveRoutes.get("/files/:fileId/versions", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  const versions = await db
    .select()
    .from(workspaceFileVersions)
    .where(eq(workspaceFileVersions.fileId, fileId))
    .orderBy(desc(workspaceFileVersions.versionNumber));

  return c.json({ success: true, data: versions });
});

// GET /files/:fileId/versions/:versionId — download specific version
workspaceDriveRoutes.get("/files/:fileId/versions/:versionId", async (c) => {
  const userId = c.get("userId");
  const fileId = c.req.param("fileId");
  const versionId = c.req.param("versionId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(workspaceFiles)
    .where(
      and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
    )
    .get();

  if (!file) {
    return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
  }

  const version = await db
    .select()
    .from(workspaceFileVersions)
    .where(eq(workspaceFileVersions.id, versionId))
    .get();

  if (!version) {
    return c.json({ success: false, error: "Versão não encontrada" }, 404);
  }

  const object = await c.env.R2.get(version.r2Key);
  if (!object) {
    return c.json({ success: false, error: "Conteúdo não encontrado" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", file.mimeType);
  return new Response(object.body, { headers });
});

// POST /files/:fileId/versions/:versionId/restore — restore a version
workspaceDriveRoutes.post(
  "/files/:fileId/versions/:versionId/restore",
  async (c) => {
    const userId = c.get("userId");
    const fileId = c.req.param("fileId");
    const versionId = c.req.param("versionId");
    const db = createDb(c.env.DB);

    const file = await db
      .select()
      .from(workspaceFiles)
      .where(
        and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.userId, userId))
      )
      .get();

    if (!file) {
      return c.json({ success: false, error: "Arquivo não encontrado" }, 404);
    }

    const version = await db
      .select()
      .from(workspaceFileVersions)
      .where(eq(workspaceFileVersions.id, versionId))
      .get();

    if (!version) {
      return c.json({ success: false, error: "Versão não encontrada" }, 404);
    }

    // Save current as a new version first
    await saveVersion(file.id, file.r2Key, file.sizeBytes ?? 0, db, c.env.R2);

    // Copy version content to current file
    const object = await c.env.R2.get(version.r2Key);
    if (!object) {
      return c.json({ success: false, error: "Conteúdo não encontrado" }, 404);
    }

    const content = await object.arrayBuffer();
    await c.env.R2.put(file.r2Key, content, {
      httpMetadata: { contentType: file.mimeType },
    });

    await db
      .update(workspaceFiles)
      .set({
        sizeBytes: version.sizeBytes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workspaceFiles.id, fileId));

    return c.json({
      success: true,
      data: { message: `Restaurado para versão ${version.versionNumber}` },
    });
  }
);

// ---------- helpers ----------

async function getValidAccessToken(
  userId: string,
  db: ReturnType<typeof createDb>,
  env: DriveEnv["Bindings"]
): Promise<string | null> {
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!settings?.googleRefreshTokenEncrypted) return null;

  // Check if token is still valid
  if (
    settings.googleAccessTokenEncrypted &&
    settings.googleTokenExpiresAt &&
    new Date(settings.googleTokenExpiresAt) > new Date()
  ) {
    try {
      return await decrypt(
        settings.googleAccessTokenEncrypted,
        env.SESSION_SECRET
      );
    } catch {
      // Fall through to refresh
    }
  }

  // Refresh token
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  let refreshToken: string;
  try {
    refreshToken = await decrypt(
      settings.googleRefreshTokenEncrypted,
      env.SESSION_SECRET
    );
  } catch {
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const expiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();
  const accessEncrypted = await encrypt(tokens.access_token, env.SESSION_SECRET);

  await db
    .update(userSettings)
    .set({
      googleAccessTokenEncrypted: accessEncrypted,
      googleTokenExpiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(userSettings.userId, userId));

  return tokens.access_token;
}

async function findOrCreateDriveFolder(
  name: string,
  accessToken: string
): Promise<string> {
  // Search for existing folder
  const q = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (searchRes.ok) {
    const data = (await searchRes.json()) as {
      files: { id: string; name: string }[];
    };
    if (data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create new folder
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  const folder = (await createRes.json()) as { id: string };
  return folder.id;
}

/**
 * Save the current version of a file before overwriting it.
 * Keeps the last 10 versions. If r2 bucket is provided, copies file content.
 */
export async function saveVersion(
  fileId: string,
  r2Key: string,
  sizeBytes: number,
  db: ReturnType<typeof createDb>,
  r2?: R2Bucket
): Promise<string | null> {
  // Get current max version number
  const latest = await db
    .select({ versionNumber: workspaceFileVersions.versionNumber })
    .from(workspaceFileVersions)
    .where(eq(workspaceFileVersions.fileId, fileId))
    .orderBy(desc(workspaceFileVersions.versionNumber))
    .get();

  const nextVersion = (latest?.versionNumber ?? 0) + 1;

  // Create version R2 key: original.v1.tex, original.v2.tex, etc
  const versionR2Key = r2Key.replace(
    /(\.[^.]+)$/,
    `.v${nextVersion}$1`
  );

  // Copy current file content to version key in R2
  if (r2) {
    const currentObj = await r2.get(r2Key);
    if (currentObj) {
      const content = await currentObj.arrayBuffer();
      await r2.put(versionR2Key, content, {
        httpMetadata: currentObj.httpMetadata,
      });
    }
  }

  const versionId = crypto.randomUUID();
  await db.insert(workspaceFileVersions).values({
    id: versionId,
    fileId,
    versionNumber: nextVersion,
    r2Key: versionR2Key,
    sizeBytes,
    createdAt: new Date().toISOString(),
  });

  // Clean up old versions (keep last 10)
  const allVersions = await db
    .select()
    .from(workspaceFileVersions)
    .where(eq(workspaceFileVersions.fileId, fileId))
    .orderBy(desc(workspaceFileVersions.versionNumber));

  if (allVersions.length > 10) {
    const toDelete = allVersions.slice(10);
    for (const v of toDelete) {
      // Delete from R2 too
      if (r2) {
        await r2.delete(v.r2Key).catch(() => {});
      }
      await db
        .delete(workspaceFileVersions)
        .where(eq(workspaceFileVersions.id, v.id));
    }
  }

  return versionId;
}
