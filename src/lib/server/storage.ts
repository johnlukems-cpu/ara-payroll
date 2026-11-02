import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Storage abstraction. The local driver writes outside the web root; files are only
 * served through authenticated route handlers. Swap in an S3-compatible driver by
 * implementing the same interface (see docs/ARCHITECTURE.md).
 */
export interface StorageDriver {
  put(data: Buffer, prefix: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_DIR ?? "storage");

function safePath(key: string) {
  const p = path.resolve(/* turbopackIgnore: true */ root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

export const localStorageDriver: StorageDriver = {
  async put(data, prefix) {
    const key = `${prefix.replace(/[^a-zA-Z0-9_-]/g, "")}/${randomUUID()}`;
    const p = safePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
    return key;
  },
  async get(key) {
    return readFile(safePath(key));
  },
  async remove(key) {
    await unlink(safePath(key)).catch(() => undefined);
  },
};

export const storage: StorageDriver = localStorageDriver;
