import { NextResponse, after, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processMaterial } from "@/lib/materials/process";
import { buildStoragePath, uploadMaterial } from "@/lib/materials/storage";
import { validateUpload } from "@/lib/materials/validation";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import type { UploadResult } from "@/lib/materials/types";

/**
 * Course material upload — one file per request.
 *
 * This is a Route Handler rather than a Server Action for one reason: size.
 * Server Actions cap the request body (1MB by default), and any request that
 * the proxy runs on has its body buffered in memory first (10MB by default).
 * `src/proxy.ts` deliberately does not match this path, so neither limit
 * applies and a large scanned PDF streams straight through.
 *
 * Skipping the proxy costs nothing security-wise: the proxy only refreshes the
 * session cookie and redirects, while authorisation here is the same
 * `requireUser()` check every other entry point uses, followed by an ownership
 * check on the course.
 */

/** 120 files per 10 minutes per user — generous for a semester's slides. */
const uploadLimiter = new FixedWindowRateLimiter(120, 10 * 60_000);

function json(result: UploadResult, status = 200) {
  return NextResponse.json(result, { status });
}

export async function POST(request: NextRequest) {
  // `requireUser()` redirects when signed out, which is not useful to fetch();
  // catch that and answer with a status the client can act on.
  let user;
  try {
    user = await requireUser();
  } catch {
    return json(
      { status: "failed", filename: "file", error: "Your session has expired. Log in again." },
      401,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json(
      {
        status: "failed",
        filename: "file",
        error: "The upload was interrupted. Try again.",
      },
      400,
    );
  }

  const file = formData.get("file");
  const fallbackName = file instanceof File ? file.name : "file";

  const courseId = formData.get("courseId");
  if (typeof courseId !== "string" || courseId.length === 0) {
    return json(
      { status: "failed", filename: fallbackName, error: "That course could not be found." },
      400,
    );
  }

  // Ownership check before touching storage. The course id came from the
  // client, so it is only ever used alongside the signed-in user's id.
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: user.id },
    select: { id: true },
  });
  if (!course) {
    return json(
      { status: "failed", filename: fallbackName, error: "That course could not be found." },
      404,
    );
  }

  if (!(file instanceof File)) {
    return json(
      { status: "failed", filename: fallbackName, error: "No file was received." },
      400,
    );
  }

  const { allowed, retryAfterMs } = uploadLimiter.check(user.id);
  if (!allowed) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    return json(
      {
        status: "failed",
        filename: fallbackName,
        error: `You have uploaded a lot of files just now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      429,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const validation = validateUpload({
    filename: file.name,
    mimeType: file.type,
    size: bytes.byteLength,
    head: bytes.subarray(0, 1024),
  });

  if (!validation.ok) {
    return json({ status: "failed", filename: fallbackName, error: validation.reason }, 400);
  }

  // Guard against a double submit or a student re-picking the same files: same
  // name and same byte count on this course is almost certainly the same
  // document, and duplicates would skew the knowledge map's sense of what the
  // course emphasises.
  const duplicate = await prisma.material.findFirst({
    where: {
      courseId: course.id,
      filename: validation.safeFilename,
      sizeBytes: bytes.byteLength,
      status: { not: "FAILED" },
    },
    select: { id: true },
  });

  if (duplicate) {
    return json({ status: "skipped", filename: validation.safeFilename });
  }

  // Create the row first so the id can key the storage path, and so a failed
  // upload leaves a visible FAILED material rather than a silent no-op.
  const material = await prisma.material.create({
    data: {
      courseId: course.id,
      filename: validation.safeFilename,
      kind: validation.kind,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: bytes.byteLength,
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

  const stored = await uploadMaterial(
    storagePath,
    bytes,
    file.type || "application/octet-stream",
  );

  if (!stored.ok) {
    await prisma.material.update({
      where: { id: material.id },
      data: { status: "FAILED", statusError: stored.reason, storagePath },
    });
    return json(
      { status: "failed", filename: validation.safeFilename, error: stored.reason },
      502,
    );
  }

  await prisma.material.update({
    where: { id: material.id },
    data: { storagePath, status: "PROCESSING" },
  });

  // Extraction runs after the response, so this file starts being read while
  // the next one is still uploading.
  after(() => processMaterial(material.id));

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/dashboard");

  return json({ status: "uploaded", filename: validation.safeFilename });
}
