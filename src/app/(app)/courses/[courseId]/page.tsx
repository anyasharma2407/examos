import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, Clock, Settings2, Target } from "lucide-react";
import { SetupProgress, type SetupStep } from "@/components/courses/setup-progress";
import { MaterialList, type MaterialRow } from "@/components/materials/material-list";
import { UploadDropzone } from "@/components/materials/upload-dropzone";
import { CourseQuestions } from "@/components/practice/course-questions";
import { BuildMapButton } from "@/components/topics/build-map-button";
import { KnowledgeMap, type KnowledgeMapTopic } from "@/components/topics/knowledge-map";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireOwnedCourse, targetGradeLabel } from "@/lib/courses";
import {
  countdownLabel,
  daysUntil,
  formatExamDate,
  formatMinutes,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Hosts the knowledge-map build and course-wide question generation, both of
 * which call the model. Measured: ~16s for a map, ~30s for questions across
 * four topics run concurrently. Serverless platforms cut a function off at
 * their own limit, so this asks for the headroom explicitly.
 */
export const maxDuration = 60;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await prisma.course.findFirst({
    where: { id: courseId, userId: user.id },
    select: { code: true },
  });
  return { title: course?.code ?? "Course" };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await requireOwnedCourse(courseId, user.id);

  const [materials, topics, questionCount, attemptCount] = await Promise.all([
    prisma.material.findMany({
      where: { courseId: course.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        status: true,
        statusError: true,
        _count: { select: { chunks: true } },
      },
    }),
    prisma.topic.findMany({
      where: { courseId: course.id },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        description: true,
        importance: true,
        masteryScore: true,
        attemptCount: true,
        sources: {
          select: { id: true, excerpt: true, material: { select: { filename: true } } },
        },
        _count: {
          select: { questions: { where: { archived: false } }, flashcards: true },
        },
      },
    }),
    prisma.question.count({ where: { courseId: course.id, archived: false } }),
    prisma.practiceAttempt.count({ where: { courseId: course.id, userId: user.id } }),
  ]);

  const topicCount = topics.length;

  const topicsWithoutQuestions = topics.filter(
    (topic) => topic._count.questions === 0,
  ).length;

  const knowledgeMap: KnowledgeMapTopic[] = topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    description: topic.description,
    importance: topic.importance,
    masteryScore: topic.masteryScore,
    attemptCount: topic.attemptCount,
    questionCount: topic._count.questions,
    flashcardCount: topic._count.flashcards,
    sources: topic.sources.map((source) => ({
      id: source.id,
      filename: source.material.filename,
      excerpt: source.excerpt,
    })),
  }));

  const materialRows: MaterialRow[] = materials.map((material) => ({
    id: material.id,
    filename: material.filename,
    sizeBytes: material.sizeBytes,
    status: material.status,
    statusError: material.statusError,
    chunkCount: material._count.chunks,
  }));

  const materialCount = materials.length;
  const readyCount = materials.filter((material) => material.status === "READY").length;

  const finalExam = course.exams.find((exam) => exam.type === "FINAL") ?? course.exams[0];
  const days = finalExam ? daysUntil(finalExam.date) : null;

  const steps: SetupStep[] = [
    {
      label: "Course created",
      detail: finalExam
        ? `Exam on ${formatExamDate(finalExam.date)}, aiming for ${targetGradeLabel(course.targetGrade)}.`
        : "Add an exam date so the plan has a deadline.",
      state: "done",
    },
    {
      label: "Upload your course material",
      detail:
        readyCount > 0
          ? `${readyCount} of ${materialCount} ${materialCount === 1 ? "file" : "files"} read and ready.`
          : "Lecture slides, tutorials and past papers. PDF, DOCX, PPTX or TXT.",
      state: readyCount > 0 ? "done" : "next",
    },
    {
      label: "Build the knowledge map",
      detail:
        topicCount > 0
          ? `${topicCount} topics found in your material.`
          : "ExamOS reads your material and works out the topics your course covers.",
      state: topicCount > 0 ? "done" : readyCount > 0 ? "next" : "later",
    },
    {
      label: "Generate practice questions",
      detail:
        questionCount > 0
          ? `${questionCount} questions ready.`
          : "Questions written from your own material, not a generic bank.",
      state: questionCount > 0 ? "done" : topicCount > 0 ? "next" : "later",
    },
    {
      label: "Practise and build mastery",
      detail:
        attemptCount > 0
          ? `${attemptCount} ${attemptCount === 1 ? "answer" : "answers"} recorded so far.`
          : "Answering questions is what turns the knowledge map into a picture of what you know.",
      state: attemptCount > 0 ? "done" : questionCount > 0 ? "next" : "later",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/courses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Courses
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {course.code}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{course.name}</h1>
          </div>
          <Button asChild variant="outline" className="h-9">
            <Link href={`/courses/${course.id}/edit`}>
              <Settings2 aria-hidden />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <CalendarDays className="size-3.5" aria-hidden />
              Exam
            </p>
            <p className="font-medium">
              {finalExam ? formatExamDate(finalExam.date) : "Not set"}
            </p>
            {finalExam ? (
              <p
                className={cn(
                  "text-sm",
                  days !== null && days >= 0 && days <= 7
                    ? "text-weak"
                    : days !== null && days <= 21
                      ? "text-moderate"
                      : "text-muted-foreground",
                )}
              >
                {countdownLabel(finalExam.date)}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Target className="size-3.5" aria-hidden />
              Target grade
            </p>
            <p className="font-medium">{targetGradeLabel(course.targetGrade)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Clock className="size-3.5" aria-hidden />
              Study time
            </p>
            <p className="font-medium">{formatMinutes(course.weeklyStudyMinutes)}</p>
            <p className="text-sm text-muted-foreground">per week</p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="materials-heading" className="space-y-4">
        <div>
          <h2 id="materials-heading" className="font-medium">
            Course material
          </h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Everything ExamOS knows about {course.code} comes from these files. Lecture
            slides, tutorials, the course outline and past papers all help.
          </p>
        </div>

        <MaterialList materials={materialRows} />
        <UploadDropzone courseId={course.id} />
      </section>

      <section aria-labelledby="knowledge-map-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="knowledge-map-heading" className="font-medium">
              Knowledge map
            </h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {topicCount > 0
                ? `The ${topicCount} topics ExamOS found in your material, most important first. Open one to study it.`
                : "The topics your course covers, worked out from the files you uploaded."}
            </p>
          </div>
        </div>

        {topicCount > 0 ? (
          <KnowledgeMap topics={knowledgeMap} courseId={course.id} />
        ) : null}

        {readyCount === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            Upload your course material above first. Once a file has finished
            reading, ExamOS can work out what this course covers.
          </p>
        ) : (
          <BuildMapButton
            courseId={course.id}
            label={topicCount > 0 ? "Rebuild knowledge map" : "Build knowledge map"}
          />
        )}

        {topicCount > 0 ? (
          <p className="text-xs text-muted-foreground text-pretty">
            Rebuild after uploading more material. Topics you have already
            practised keep their history. Open a topic to study it or write
            questions for it.
          </p>
        ) : null}
      </section>

      {topicCount > 0 ? (
        <CourseQuestions
          courseId={course.id}
          totalQuestions={questionCount}
          topicsWithoutQuestions={topicsWithoutQuestions}
        />
      ) : null}

      <SetupProgress steps={steps} />
    </div>
  );
}
