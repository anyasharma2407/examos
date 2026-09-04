import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PracticeRunner, type PracticeQuestion } from "@/components/practice/practice-runner";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { requireOwnedCourse } from "@/lib/courses";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Practice" };
export const dynamic = "force-dynamic";

/**
 * A practice session.
 *
 * `?topic=` narrows to one topic; without it the session draws from the whole
 * course, weakest topics first.
 */
export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ topic?: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const { topic: topicId } = await searchParams;

  const course = await requireOwnedCourse(courseId, user.id);

  // Only the prompt and options are selected: answers, hints and explanations
  // must not reach the browser before the student has attempted the question.
  const questions = await prisma.question.findMany({
    where: {
      courseId: course.id,
      archived: false,
      ...(topicId ? { topicId } : {}),
    },
    orderBy: topicId
      ? [{ createdAt: "asc" }]
      : [{ topic: { masteryScore: "asc" } }, { createdAt: "asc" }],
    take: 12,
    select: {
      id: true,
      type: true,
      difficulty: true,
      prompt: true,
      choices: true,
      topic: { select: { id: true, name: true } },
    },
  });

  const runnerQuestions: PracticeQuestion[] = questions.map((question) => ({
    id: question.id,
    type: question.type,
    difficulty: question.difficulty,
    prompt: question.prompt,
    choices: question.choices,
  }));

  const heading =
    topicId && questions[0] ? questions[0].topic.name : `${course.code} practice`;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link
          href={`/courses/${course.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {course.code}
        </Link>
      </div>

      {runnerQuestions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">No questions yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
            Open a topic from your knowledge map and generate questions for it first.
          </p>
          <Button asChild className="mt-6 h-9">
            <Link href={`/courses/${course.id}`}>Back to course</Link>
          </Button>
        </div>
      ) : (
        <PracticeRunner
          courseId={course.id}
          topicName={heading}
          questions={runnerQuestions}
        />
      )}
    </div>
  );
}
