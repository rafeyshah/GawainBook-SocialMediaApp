import fs from "fs";
import path from "path";
import type { Response } from "express";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Where uploaded images live. Neon object storage in production; a local
// folder when no bucket is configured (local dev without Neon, and tests).
export interface Storage {
  readonly kind: "neon" | "disk";
  /** Origin images are served from, if not this app (for the CSP img-src). */
  readonly imageOrigin?: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  // Sends the image (or a redirect to it) for GET /images/<key>.
  respond(key: string, res: Response): Promise<void>;
}

export const PRESIGNED_TTL_SECONDS = 3600;
// Browsers may reuse the redirect for a short time; the signed URL lasts longer.
export const REDIRECT_CACHE_SECONDS = 300;

type Presign = (client: S3Client, command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;

export class S3Storage implements Storage {
  readonly kind = "neon" as const;

  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly bucket: string,
    private readonly presign: Presign = getSignedUrl as unknown as Presign,
    readonly imageOrigin?: string
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Each upload gets a new key, so the object never changes.
        CacheControl: "private, max-age=31536000, immutable",
      })
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  // Private bucket: hand the browser a short-lived signed URL.
  async respond(key: string, res: Response): Promise<void> {
    const url = await this.presign(
      this.client as S3Client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGNED_TTL_SECONDS }
    );
    res.set("Cache-Control", `private, max-age=${REDIRECT_CACHE_SECONDS}`);
    res.redirect(302, url);
  }
}

export class DiskStorage implements Storage {
  readonly kind = "disk" as const;

  constructor(private readonly dir: string) {}

  private file(key: string): string {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("Invalid key");
    return full;
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const file = this.file(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, body);
  }

  async remove(key: string): Promise<void> {
    await fs.promises.rm(this.file(key), { force: true });
  }

  async respond(key: string, res: Response): Promise<void> {
    const file = this.file(key);
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "Image not found." });
      return;
    }
    res.sendFile(file);
  }
}

// Neon injects AWS-standard variables (AWS_ENDPOINT_URL_S3, AWS_REGION,
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY). Neon requires path-style URLs.
export function createStorage(env: NodeJS.ProcessEnv = process.env): Storage {
  if (env.AWS_ENDPOINT_URL_S3 && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const client = new S3Client({ forcePathStyle: true });
    return new S3Storage(client, env.STORAGE_BUCKET || "assets", undefined, new URL(env.AWS_ENDPOINT_URL_S3).origin);
  }
  return new DiskStorage(env.UPLOAD_DIR || path.join(__dirname, "../uploads"));
}
