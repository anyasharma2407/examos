import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSignedUrl } from "@/lib/materials/storage";

/**
 * Opens the original uploaded file.
 *
 * The storage bucket is private, so this mints a short-lived signed URL and
 * redirects to it — after checking the caller owns the course the material
 * belongs to. A material id from a URL is never trusted on its own, and the
 * link that comes back expires in a minute, so it is not something that can be
 * shared onward.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string; materialId: string }> },
) {
  const user = await requireUser();
  const { materialId } = await params;

  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: { storagePath: true },
  });

  if (!material) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await createSignedUrl(material.storagePath, 60);
  if (!url) {
    return NextResponse.json({ error: "Could not open that file." }, { status: 502 });
  }

  return NextResponse.redirect(url);
}
