import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Extract packed project files into a temporary workspace directory.
 * Returns the workspace path.
 *
 * @param {string} sessionId
 * @param {Array<{path: string, content: string, mimeType: string, isBinary: boolean}>} files
 * @returns {string} workspace directory path
 */
export function extractFiles(sessionId, files) {
  const workDir = path.join(os.tmpdir(), "workspace", sessionId);
  fs.mkdirSync(workDir, { recursive: true });

  for (const file of files) {
    const filePath = path.join(workDir, file.path);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    if (file.isBinary) {
      // Base64-encoded binary file
      const buf = Buffer.from(file.content, "base64");
      fs.writeFileSync(filePath, buf);
    } else {
      fs.writeFileSync(filePath, file.content, "utf-8");
    }
  }

  return workDir;
}

/**
 * Collect all changed/created files from the workspace.
 * Compares against the original file set and checks mtimes.
 *
 * @param {string} workDir
 * @param {Map<string, number>} originalMtimes - path → mtime ms
 * @param {Set<string>} trackedPaths - paths touched by Write/Edit tools
 * @returns {Array<{path: string, content: string, mimeType: string, isBinary: boolean}>}
 */
export function collectChangedFiles(workDir, originalMtimes, trackedPaths) {
  const changed = [];

  for (const relPath of trackedPaths) {
    const absPath = path.join(workDir, relPath);
    if (!fs.existsSync(absPath)) continue;

    const stat = fs.statSync(absPath);
    const originalMtime = originalMtimes.get(relPath);

    // Include if file is new or modified
    if (!originalMtime || stat.mtimeMs > originalMtime) {
      const isBinary = isBinaryPath(relPath);
      let content;

      if (isBinary) {
        content = fs.readFileSync(absPath).toString("base64");
      } else {
        content = fs.readFileSync(absPath, "utf-8");
      }

      changed.push({
        path: relPath,
        content,
        mimeType: guessMimeType(relPath),
        isBinary,
      });
    }
  }

  return changed;
}

/**
 * Record original mtimes for all extracted files.
 * @param {string} workDir
 * @param {Array<{path: string}>} files
 * @returns {Map<string, number>}
 */
export function recordMtimes(workDir, files) {
  const mtimes = new Map();
  for (const file of files) {
    const absPath = path.join(workDir, file.path);
    if (fs.existsSync(absPath)) {
      mtimes.set(file.path, fs.statSync(absPath).mtimeMs);
    }
  }
  return mtimes;
}

/**
 * Clean up workspace directory.
 * @param {string} workDir
 */
export function cleanupWorkspace(workDir) {
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

function isBinaryPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".svg", ".zip", ".tar", ".gz",
  ].includes(ext);
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".tex": "text/x-latex",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}
