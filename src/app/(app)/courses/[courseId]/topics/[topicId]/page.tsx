import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ExternalLink,
  FileText,
  Lightbulb,
  MonitorPlay,
} from "lucide-react";
import { FlashcardDeck, type DeckCard } from "@/components/flashcards/flashcard-deck";
import { GenerateFlashcardsButton } from "@/components/flashcards/generate-flashcards-button";
import { GenerateQuestionsButton } from "@/components/practice/generate-questions-button";
import { BuildGuideButton } from "@/components/topics/build-guide-button";
import { TutorPanel } from "@/components/topics/tutor-panel";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireOwnedTopic } from "@/lib/study";

/**
 * Hosts study-guide generation (~13s), question generation (~27s) and the
 * tutor (~11s).
 */
export const maxDuration = 60;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topicId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { topicId } = await params;
  const topic = await requireOwnedTopic(topicId, user.id);
  return { title: topic.name };
}

/** A YouTube search always resolves; a model-invented video id does not. */
function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

/** Same reasoning for books: search, never a fabricated ISBN or store link. */
function bookSearchUrl(title: string): string {
  return `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(title)}`;
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ courseId: string; topicId: string }>;
}) {
  const user = await requireUser();
  const { courseId, topicId } = await params;
  const topic = await requireOwnedTopic(topicId, user.id);
  const guide = topic.guide;

  const questionCount = await prisma.question.count({
    where: { topicId: topic.id, archived: false },
  });

  const cards: DeckCard[] = topic.flashcards.map((card) => ({
    id: card.id,
    kind: card.kind,
    front: card.front,
    back: card.back,
    sourceFilename: card.sourceMaterial?.filename ?? null,
  }));

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/courses/${courseId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {topic.course.code}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{topic.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground text-pretty">
          {topic.description}
        </p>
      </div>

      {!guide ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-5 py-10 sm:items-center sm:text-center">
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <BookOpen className="size-5" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h2 className="font-medium">No study guide yet</h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground text-pretty">
                ExamOS can write one from the parts of your material that cover this
                topic — a summary, what to read and where, and the mistakes to avoid.
              </p>
            </div>
            <BuildGuideButton
              courseId={courseId}
              topicId={topic.id}
              label="Write my study guide"
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-labelledby="summary-heading" className="space-y-3">
            <h2 id="summary-heading" className="font-medium">
              What this is
            </h2>
            <p className="max-w-2xl leading-relaxed text-pretty">{guide.summary}</p>
          </section>

          {guide.keyIdeas.length > 0 ? (
            <section aria-labelledby="key-ideas-heading" className="space-y-3">
              <h2 id="key-ideas-heading" className="font-medium">
                Learn these, in order
              </h2>
              <ol className="space-y-2">
                {guide.keyIdeas.map((idea, index) => (
                  <li key={idea} className="flex gap-3 text-sm">
                    <span className="tabular mt-0.5 shrink-0 text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="text-pretty">{idea}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {guide.readings.length > 0 ? (
            <section aria-labelledby="readings-heading" className="space-y-3">
              <h2 id="readings-heading" className="font-medium">
                Read this in your material
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {guide.readings.map((reading) => (
                  <li key={reading.id} className="px-4 py-3.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {reading.material.filename}
                      {reading.chunk ? (
                        <span className="tabular rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                          section {reading.chunk.index + 1}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-sm text-pretty">{reading.focus}</p>
                    <p className="mt-1 text-sm text-muted-foreground text-pretty">
                      {reading.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {guide.pitfalls.length > 0 ? (
            <section aria-labelledby="pitfalls-heading" className="space-y-3">
              <h2 id="pitfalls-heading" className="font-medium">
                Where people go wrong
              </h2>
              <ul className="space-y-2">
                {guide.pitfalls.map((pitfall) => (
                  <li key={pitfall} className="flex gap-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-moderate" aria-hidden />
                    <span className="text-pretty">{pitfall}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {guide.videoSearches.length > 0 || guide.suggestedReading.length > 0 ? (
            <section aria-labelledby="elsewhere-heading" className="space-y-3">
              <h2 id="elsewhere-heading" className="font-medium">
                Elsewhere
              </h2>
              <p className="text-sm text-muted-foreground text-pretty">
                Suggestions from outside your course material, so check them against
                what your course actually teaches. These open searches rather than
                specific links — a made-up video ID or edition number would only send
                you somewhere that does not exist.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {guide.videoSearches.length > 0 ? (
                  <Card>
                    <CardContent className="space-y-2.5">
                      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <MonitorPlay className="size-3.5" aria-hidden />
                        Video explanations
                      </p>
                      <ul className="space-y-1.5">
                        {guide.videoSearches.map((query) => (
                          <li key={query}>
                            <a
                              href={youtubeSearchUrl(query)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1.5 text-sm underline-offset-4 hover:underline"
                            >
                              <span className="text-pretty">{query}</span>
                              <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}

                {guide.suggestedReading.length > 0 ? (
                  <Card>
                    <CardContent className="space-y-2.5">
                      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <BookOpen className="size-3.5" aria-hidden />
                        Textbooks
                      </p>
                      <ul className="space-y-1.5">
                        {guide.suggestedReading.map((book) => (
                          <li key={book}>
                            <a
                              href={bookSearchUrl(book)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1.5 text-sm underline-offset-4 hover:underline"
                            >
                              <span className="text-pretty">{book}</span>
                              <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <BuildGuideButton
              courseId={courseId}
              topicId={topic.id}
              label="Rewrite this guide"
            />
            <p className="text-xs text-muted-foreground">
              Rewrite after uploading more material for this topic.
            </p>
          </div>
        </>
      )}

      <section
        aria-labelledby="flashcards-heading"
        className="space-y-4 border-t border-border pt-8"
      >
        <div>
          <h2 id="flashcards-heading" className="font-medium">
            Flashcards
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
            {cards.length > 0
              ? `${cards.length} cards covering the definitions, rules, distinctions and traps in this topic. Read the front, answer it in your head, then reveal.`
              : "Cards drilling the things you need to recall without thinking — what something is, the exact rule, how it differs from its neighbour, when to use it, and where people go wrong."}
          </p>
        </div>

        {cards.length > 0 ? <FlashcardDeck cards={cards} /> : null}

        <GenerateFlashcardsButton
          courseId={courseId}
          topicId={topic.id}
          cardCount={cards.length}
        />
      </section>

      <section
        aria-labelledby="practice-heading"
        className="space-y-3 border-t border-border pt-8"
      >
        <div>
          <h2 id="practice-heading" className="font-medium">
            Practise this topic
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
            {questionCount > 0
              ? `${questionCount} ${questionCount === 1 ? "question" : "questions"} written from your material. Answering them is what moves your mastery score.`
              : "Questions written from your own material — applying the method, not reciting the definition."}
          </p>
        </div>
        <GenerateQuestionsButton
          courseId={courseId}
          topicId={topic.id}
          questionCount={questionCount}
          label={questionCount > 0 ? "Write more questions" : "Write practice questions"}
        />
      </section>

      <div className="border-t border-border pt-8">
        <TutorPanel topicId={topic.id} topicName={topic.name} />
      </div>

      {topic.sources.length > 0 ? (
        <section aria-labelledby="evidence-heading" className="space-y-3 border-t border-border pt-8">
          <h2 id="evidence-heading" className="flex items-center gap-2 font-medium">
            <Lightbulb className="size-4 text-muted-foreground" aria-hidden />
            Why this is a topic in your course
          </h2>
          <ul className="space-y-2">
            {topic.sources.map((source) => (
              <li key={source.id} className="text-sm text-muted-foreground">
                <span className="font-medium">{source.material.filename}</span> —{" "}
                <span className="italic">“{source.excerpt}”</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
