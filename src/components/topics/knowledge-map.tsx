import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export type KnowledgeMapSource = {
  id: string;
  filename: string;
  excerpt: string;
  materialId: string;
  /** 1-based section in that file, when the citation resolved to one. */
  section: number | null;
};

export type KnowledgeMapTopic = {
  id: string;
  name: string;
  description: string;
  importance: number;
  masteryScore: number;
  attemptCount: number;
  questionCount: number;
  flashcardCount: number;
  sources: KnowledgeMapSource[];
};

/** Importance is a 0..1 estimate; show it as a coarse band, not a false decimal. */
function importanceLabel(importance: number): string {
  if (importance >= 0.75) return "Core";
  if (importance >= 0.45) return "Important";
  return "Supporting";
}

function masteryTone(score: number, attempts: number): string {
  if (attempts === 0) return "text-muted-foreground";
  if (score >= 0.8) return "text-strong";
  if (score >= 0.5) return "text-moderate";
  return "text-weak";
}

/**
 * The course knowledge map.
 *
 * Every topic shows the material it was drawn from — that is what separates
 * this from a generic syllabus, and it lets a student check the map against
 * their own notes. Each row opens that topic's study page.
 */
export function KnowledgeMap({
  topics,
  courseId,
}: {
  topics: KnowledgeMapTopic[];
  courseId: string;
}) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {topics.map((topic, index) => (
        <li key={topic.id} className="relative px-4 py-4 transition-colors hover:bg-muted/40">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tabular text-sm text-muted-foreground">{index + 1}</span>
            <h3 className="font-medium">
              <Link href={`/courses/${courseId}/topics/${topic.id}`}>
                {/* Stretched so the whole row is the target, without nesting links. */}
                <span className="absolute inset-0" aria-hidden />
                <span className="underline-offset-4 group-hover:underline">{topic.name}</span>
                <span className="sr-only"> — open study guide</span>
              </Link>
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {importanceLabel(topic.importance)}
            </span>
            <span
              className={cn(
                "tabular ml-auto text-sm",
                masteryTone(topic.masteryScore, topic.attemptCount),
              )}
            >
              {topic.attemptCount === 0
                ? "Not practised"
                : `${Math.round(topic.masteryScore * 100)}%`}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>

          <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
            {topic.description}
          </p>

          <p className="mt-2 text-xs text-muted-foreground">
            {[
              topic.flashcardCount > 0
                ? `${topic.flashcardCount} ${topic.flashcardCount === 1 ? "flashcard" : "flashcards"}`
                : null,
              topic.questionCount > 0
                ? `${topic.questionCount} practice ${topic.questionCount === 1 ? "question" : "questions"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No flashcards or questions yet"}
          </p>

          {topic.sources.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {topic.sources.map((source) => (
                <li key={source.id} className="flex gap-2 text-xs text-muted-foreground">
                  <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    {/* Relative so it sits above the row's stretched link. */}
                    <Link
                      href={`/courses/${courseId}/materials/${source.materialId}${
                        source.section ? `?section=${source.section}` : ""
                      }`}
                      className="relative font-medium underline-offset-4 hover:underline"
                    >
                      {source.filename}
                      {source.section ? ` · section ${source.section}` : ""}
                    </Link>
                    <span className="block truncate italic">“{source.excerpt}”</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
