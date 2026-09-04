import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MATERIAL_BUCKET } from "@/lib/materials/constants";

/**
 * Private object storage for uploaded course material.
 *
 * Files never go to the browser directly and the bucket is never public. All
 * access runs through the server with the service-role key, after the caller's
 * ownership of the course has been checked — so there are no storage RLS
 * policies to get wrong, and a leaked object path is not enough to read a file.
 *
 * Object keys are always `<userId>/<courseId>/<materialId>-<filename>`. The
 * user id prefix means a path built for one user can never address another
 * user's object, even if a bug let an unvalidated id through.
 */

/**
 * Bucket creation is idempotent and memoised per process. Doing it here keeps
 * local setup to `npx supabase start` with no manual dashboard step; in a
 * hosted project the first call simply finds the bucket already present.
 */
let bucketReady: Promise<void> | null = null;

export function resetBucketCache(): void {
  bucketReady = null;
}

async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.getBucket(MATERIAL_BUCKET);
    if (data) return;

    const { error } = await supabase.storage.createBucket(MATERIAL_BUCKET, {
      public: false,
    });

    // A concurrent request may have won the race; that is success, not failure.
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create the storage bucket: ${error.message}`);
    }
  })();

  try {
    await bucketReady;
  } catch (error) {
    // Do not cache a failure, or every later upload in this process fails too.
    bucketReady = null;
    throw error;
  }
}

export function buildStoragePath(
  userId: string,
  courseId: string,
  materialId: string,
  filename: string,
): string {
  return `${userId}/${courseId}/${materialId}-${filename}`;
}

export async function uploadMaterial(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await ensureBucket();

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) {
    console.error("[materials] upload failed", error);
    return { ok: false, reason: "The file could not be saved. Try again." };
  }

  return { ok: true };
}

export async function downloadMaterial(path: string): Promise<Uint8Array | null> {
  await ensureBucket();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(MATERIAL_BUCKET).download(path);

  if (error || !data) {
    console.error("[materials] download failed", error);
    return null;
  }

  return new Uint8Array(await data.arrayBuffer());
}

/** Best-effort cleanup. A missing object is not an error worth surfacing. */
export async function removeMaterial(path: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.storage.from(MATERIAL_BUCKET).remove([path]);
  } catch (error) {
    console.error("[materials] delete failed", error);
  }
}

/**
 * A short-lived signed URL, so a student can open their own file. The bucket
 * stays private: the link expires, and it is only ever minted after ownership
 * has been verified.
 */
export async function createSignedUrl(
  path: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(MATERIAL_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) {
    console.error("[materials] signed url failed", error);
    return null;
  }

  return data.signedUrl;
}
