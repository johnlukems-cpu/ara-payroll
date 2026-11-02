import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Storage abstraction. Files are only ever served through authenticated route handlers.
 * - S3 driver (set S3_BUCKET): AWS S3, Cloudflare R2, Supabase Storage or any S3-compatible
 *   service. Required on serverless hosts such as Vercel, whose filesystem is not persistent.
 * - Local driver (default): writes to STORAGE_DIR, outside the web root.
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
    const key = newKey(prefix);
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

const newKey = (prefix: string) => `${prefix.replace(/[^a-zA-Z0-9_-]/g, "")}/${randomUUID()}`;

function s3Driver(bucket: string): StorageDriver {
  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" }
      : undefined,
  });
  return {
    async put(data, prefix) {
      const key = newKey(prefix);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : "AES256" }));
      return key;
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    },
  };
}

export const storage: StorageDriver = process.env.S3_BUCKET ? s3Driver(process.env.S3_BUCKET) : localStorageDriver;
