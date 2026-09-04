"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MATERIAL_BUCKET } from "@/lib/materials/constants";
import { processMaterial } from "@/lib/materials/process";
import { buildStoragePath, createUploadUrl, statMaterial } from "@/lib/materials/storage";
import { validateUploadMetadata } from "@/lib/materials/validation";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import type { UploadResult } from "@/lib/materials/types";

/**
 * Starting and finishing a direct-to-storage upload.
 *
 * The file itself never passes through the app server: the browser PUTs it
 * straight to Supabase Storage using a short-lived signed URL minted here.
 * That removes the host's request-body limit from the picture entirely —
 * Vercel caps function request bodies at 4.5MB, which no real lecture PDF fits
 * inside — and means a 100MB upload costs the server nothing but two tiny
 * round trips.
 *
 * Only these two calls cross the wire, and both carry ids and a filename:
 *
 *   1. `startUploadAction`  — checks ownership, validates what is knowable
 *      without the bytes, creates the row, returns a signed URL for a path the
 *      server chose.
 *   2. `finishUploadAction` — confirms the object actually arrived, records its
 *      real size, and queues processing.
 *
 * The client cannot choose the storage path, and the file's declared type is
 * only taken on trust until processing reads the bytes and checks it.
 */

/** 120 uploads per 10 minutes per user — generous for a semester's slides. */
const uploadLimiter = new FixedWindowRateLimiter(120, 10 * 60_000);

export type StartUploadResult =
  | {
      ok: true;
      materialId: string;
      bucket: string;
      path: string;
      token: string;
      filename: string;
    }
  | { ok: false; error: string };

export async function startUploadAction(input: {
  courseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<StartUploadResult> {
  const user = await requireUser();

  const course = await prisma.course.findFirst({
    where: { id: input.courseId, userId: user.id },
    select: { id: true },
  });
  if (!course) return { ok: false, error: "That course could not be found." };

  const { allowed, retryAfterMs } = uploadLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return {
      ok: false,
      error: `You have uploaded a lot of files just now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const validation = validateUploadMetadata({
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.sizeBytes,
  });
  if (!validation.ok) return { ok: false, error: validation.reason };

  // Same name and byte count on this course is almost certainly the same
  // document; duplicates would skew what the knowledge map thinks the course
  // emphasises.
  const duplicate = await prisma.material.findFirst({
    where: {
      courseId: course.id,
      filename: validation.safeFilename,
      sizeBytes: input.sizeBytes,
      status: { not: "FAILED" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "__DUPLICATE__" };
  }

  const material = await prisma.material.create({
    data: {
      courseId: course.id,
      filename: validation.safeFilename,
      kind: validation.kind,
      mimeType: input.mimeType || "application/octet-stream",
      sizeBytes: input.sizeBytes,
      storagePath: `pending:${crypto.randomUUID()}`,
      status: "UPLOADING",
    },
    select: { id: true },
  });

  const storagePath = buildStoragePath(
    user.id,
    course.id,
    material.id,
    validation.safeFilename,
  );

  const signed = await createUploadUrl(storagePath);
  if (!signed.ok) {
    await prisma.material.update({
      where: { id: material.id },
      data: { status: "FAILED", statusError: signed.reason, storagePath },
    });
    return { ok: false, error: signed.reason };
  }

  await prisma.material.update({
    where: { id: material.id },
    data: { storagePath },
  });

  return {
    ok: true,
    materialId: material.id,
    bucket: MATERIAL_BUCKET,
    path: signed.path,
    token: signed.token,
    filename: validation.safeFilename,
  };
}

export async function finishUploadAction(input: {
  courseId: string;
  materialId: string;
  /** Set when the browser's upload failed, so the row is not left hanging. */
  failed?: string;
}): Promise<UploadResult> {
  const user = await requireUser();

  const material = await prisma.material.findFirst({
    where: { id: input.materialId, course: { userId: user.id } },
    select: { id: true, filename: true, storagePath: true, courseId: true },
  });
  if (!material) {
    return { status: "failed", filename: "file", error: "That upload could not be found." };
  }

  if (input.failed) {
    await prisma.material.update({
      where: { id: material.id },
      data: { status: "FAILED", statusError: input.failed },
    });
    return { status: "failed", filename: material.filename, error: input.failed };
  }

  // The client says it uploaded; storage is the authority on whether it did.
  const stat = await statMaterial(material.storagePath);
  if (!stat.exists) {
    const reason = "The file did not finish uploading. Try again.";
    await prisma.material.update({
      where: { id: material.id },
      data: { status: "FAILED", statusError: reason },
    });
    return { status: "failed", filename: material.filename, error: reason };
  }

  await prisma.material.update({
    where: { id: material.id },
    // Record what the object actually weighs, not what the client claimed.
    data: { status: "PROCESSING", sizeBytes: stat.sizeBytes || undefined },
  });

  after(() => processMaterial(material.id));

  revalidatePath(`/courses/${input.courseId}`);
  revalidatePath("/dashboard");

  return { status: "uploaded", filename: material.filename };
}
