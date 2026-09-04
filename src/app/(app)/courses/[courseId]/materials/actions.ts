"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processMaterial } from "@/lib/materials/process";
import { createSignedUrl, removeMaterial } from "@/lib/materials/storage";

/**
 * Material management actions.
 *
 * Uploading itself lives in a Route Handler (src/app/api/materials/upload)
 * because Server Actions cap the request body well below a large PDF. These
 * actions carry only ids, so they stay Server Actions.
 *
 * A material id arriving from the client is untrusted: every lookup reaches the
 * row through its course's owner.
 */

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const materialId = formData.get("materialId");
  if (typeof materialId !== "string" || materialId.length === 0) return;

  // Reached through the course so the owner filter still applies.
  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: { id: true, courseId: true, storagePath: true },
  });
  if (!material) return;

  await prisma.material.delete({ where: { id: material.id } });
  await removeMaterial(material.storagePath);

  revalidatePath(`/courses/${material.courseId}`);
  revalidatePath("/dashboard");
}

export async function retryMaterialAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const materialId = formData.get("materialId");
  if (typeof materialId !== "string" || materialId.length === 0) return;

  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: { id: true, courseId: true },
  });
  if (!material) return;

  await prisma.material.update({
    where: { id: material.id },
    data: { status: "PROCESSING", statusError: null },
  });

  after(() => processMaterial(material.id));

  revalidatePath(`/courses/${material.courseId}`);
}

/** Short-lived link so a student can open a file they uploaded. */
export async function getMaterialUrlAction(materialId: string): Promise<string | null> {
  const user = await requireUser();

  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: { storagePath: true },
  });
  if (!material) return null;

  return createSignedUrl(material.storagePath);
}
