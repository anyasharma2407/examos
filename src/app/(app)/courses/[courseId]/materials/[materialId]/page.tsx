import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Sparkles } from "lucide-react";
import { SummariseSectionButton } from "@/components/materials/summarise-button";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/materials/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Reading one uploaded document, opened at a particular section.
 *
 * This shows the *extracted* text rather than the original file, and that is
 * deliberate. A study guide points at "week02.pptx, section 3"; opening the
 * original would drop the student into a slide deck to find it themselves,
 * and for a 600-page PDF that is worse than useless. The extracted text is
 * also exactly what the AI layer read, so what the student sees here is what
 * the citation actually refers to. The original file is one click away for
 * anything the extractor could not carry across, like diagrams.
 *
 * Only a window around the requested section is loaded — a large PDF runs to
 * well over a thousand sections, and rendering them all would be slow and
 * unreadable.
 */

/** Sections either side of the target to render for context. */
const CONTEXT = 3;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ materialId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { materialId } = await params;
  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: { filename: true },
  });
  return { title: material?.filename ?? "Material" };
}

export default async function MaterialReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; materialId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await requireUser();
  const { courseId, materialId } = await params;
  const { section } = await searchParams;

  // Reached through the course, so another user's material is simply not found.
  const material = await prisma.material.findFirst({
    where: { id: materialId, course: { userId: user.id } },
    select: {
      id: true,
      filename: true,
      sizeBytes: true,
      status: true,
      courseId: true,
      course: { select: { code: true } },
      _count: { select: { chunks: true } },
    },
  });

  if (!material) notFound();

  const total = material._count.chunks;

  // Sections are 1-based in the UI and 0-based in the database.
  const requested = Number(section);
  const target =
    Number.isInteger(requested) && requested >= 1 && requested <= total ? requested : 1;
  const targetIndex = target - 1;

  const chunks = await prisma.materialChunk.findMany({
    where: {
      materialId: material.id,
      index: { gte: targetIndex - CONTEXT, lte: targetIndex + CONTEXT },
    },
    orderBy: { index: "asc" },
    select: { id: true, index: true, content: true, pageNumber: true, summary: true },
  });

  const sectionUrl = (n: number) =>
    `/courses/${courseId}/materials/${material.id}?section=${n}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {material.course.code}
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{material.filename}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatBytes(material.sizeBytes)}
              {total > 0 ? ` · ${total} ${total === 1 ? "section" : "sections"}` : ""}
            </p>
          </div>

          <Button asChild variant="outline" className="h-9">
            <a
              href={`/courses/${courseId}/materials/${material.id}/open`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground text-pretty">
          {material.status === "FAILED"
            ? "This file could not be read, so there is no text to show. Open the original instead."
            : "This file has not finished being read yet."}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(target <= 1 && "pointer-events-none opacity-50")}
            >
              <Link href={sectionUrl(Math.max(1, target - 1))}>
                <ChevronLeft aria-hidden />
                Previous
              </Link>
            </Button>

            <p className="tabular text-sm text-muted-foreground">
              Section {target} of {total}
            </p>

            <Button
              asChild
              variant="outline"
              size="sm"
              className={cn(target >= total && "pointer-events-none opacity-50")}
            >
              <Link href={sectionUrl(Math.min(total, target + 1))}>
                Next
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </div>

          <ol className="space-y-3">
            {chunks.map((chunk) => {
              const number = chunk.index + 1;
              const isTarget = chunk.index === targetIndex;

              return (
                <li
                  key={chunk.id}
                  id={`section-${number}`}
                  className={cn(
                    "scroll-mt-20 rounded-xl border px-5 py-4",
                    isTarget
                      ? "border-foreground/25 bg-card shadow-sm"
                      : "border-border/60 bg-muted/20",
                  )}
                >
                  <p className="mb-2 flex items-center gap-2">
                    <span
                      className={cn(
                        "tabular text-xs font-medium",
                        isTarget ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      Section {number}
                    </span>
                    {chunk.pageNumber ? (
                      <span className="text-xs text-muted-foreground">
                        page {chunk.pageNumber}
                      </span>
                    ) : null}
                    {isTarget ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        You were sent here
                      </span>
                    ) : null}
                  </p>

                  {chunk.summary ? (
                    <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        <Sparkles className="size-3" aria-hidden />
                        Summary
                      </p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-pretty">
                        {chunk.summary}
                      </p>
                    </div>
                  ) : null}

                  <p
                    className={cn(
                      "text-sm leading-relaxed whitespace-pre-wrap",
                      isTarget ? "" : "text-muted-foreground",
                    )}
                  >
                    {chunk.content}
                  </p>

                  {isTarget ? (
                    <div className="mt-4">
                      <SummariseSectionButton
                        chunkId={chunk.id}
                        path={`/courses/${courseId}/materials/${material.id}`}
                        hasSummary={Boolean(chunk.summary)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <p className="text-xs text-muted-foreground text-pretty">
            This is the text ExamOS extracted from your file — the same text its topics
            and questions were built from. Open the original for anything the extractor
            could not carry across, such as diagrams.
          </p>
        </>
      )}
    </div>
  );
}
