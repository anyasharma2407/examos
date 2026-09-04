"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, Flag, Loader2, X } from "lucide-react";
import {
  reportQuestionAction,
  submitAnswerAction,
  type AnswerState,
} from "@/app/(app)/courses/[courseId]/practice/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Difficulty, QuestionType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type PracticeQuestion = {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  choices: string[];
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

const INITIAL: AnswerState = {};

/**
 * One question at a time.
 *
 * Nothing about the answer — not the explanation, not the hint, not the correct
 * option — is sent to the browser until the student has submitted. The question
 * list this renders carries only the prompt and the options; everything else
 * arrives in the Server Action's response. Shipping it up front would put the
 * answers in view source.
 */
export function PracticeRunner({
  courseId,
  topicName,
  questions,
}: {
  courseId: string;
  topicName: string;
  questions: PracticeQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(submitAnswerAction, INITIAL);
  const startedAt = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Stamps how long the student spent, at the moment they submit.
  function submitWithTiming(formData: FormData) {
    const elapsed = startedAt.current === 0 ? 0 : (Date.now() - startedAt.current) / 1000;
    formData.set("timeSpentS", String(Math.round(elapsed)));
    formAction(formData);
  }

  const question = questions[index];

  // A result is only ever shown against the question it was produced for, so a
  // stale response can never be attached to the next question.
  const result = state.questionId === question?.id ? state.result : undefined;
  const error = state.questionId === question?.id ? state.error : undefined;
  const answered = Boolean(result);

  useEffect(() => {
    // The clock for a question starts when it appears on screen.
    startedAt.current = Date.now();
  }, [index]);

  if (!question) {
    return (
      <div className="rounded-xl border border-border px-6 py-12 text-center">
        <p className="font-medium">Nothing left to practise here.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
          Generate more questions for this topic, or move on to another one.
        </p>
        <Button asChild className="mt-6 h-9">
          <Link href={`/courses/${courseId}`}>Back to course</Link>
        </Button>
      </div>
    );
  }

  const isLast = index === questions.length - 1;

  function goNext() {
    setChoice(null);
    setIndex((current) => current + 1);
    formRef.current?.reset();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{topicName}</span>
          <span className="mx-2">·</span>
          <span className="tabular">
            Question {index + 1} of {questions.length}
          </span>
        </p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
      </div>

      <div
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-label="Practice progress"
      >
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>

      <p className="text-lg leading-relaxed text-pretty">{question.prompt}</p>

      <form ref={formRef} action={submitWithTiming} className="space-y-4">
        <input type="hidden" name="questionId" value={question.id} />
        <input type="hidden" name="courseId" value={courseId} />

        {question.type === "MULTIPLE_CHOICE" ? (
          <fieldset disabled={answered} className="space-y-2">
            <legend className="sr-only">Choose an answer</legend>
            {question.choices.map((option) => {
              const isCorrectOption = answered && result && option === result.correctAnswer;
              const isChosenWrong = answered && choice === option && !result?.correct;

              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                    !answered && "border-border hover:bg-muted/60",
                    !answered && choice === option && "border-foreground bg-muted/60",
                    isCorrectOption && "border-strong/40 bg-strong/5",
                    isChosenWrong && "border-destructive/40 bg-destructive/5",
                    answered && !isCorrectOption && !isChosenWrong && "border-border opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="answer"
                    value={option}
                    checked={choice === option}
                    onChange={() => setChoice(option)}
                    required
                    className="mt-0.5 size-4"
                  />
                  <span className="text-pretty">{option}</span>
                  {isCorrectOption ? (
                    <Check className="ml-auto size-4 shrink-0 text-strong" aria-hidden />
                  ) : null}
                  {isChosenWrong ? (
                    <X className="ml-auto size-4 shrink-0 text-destructive" aria-hidden />
                  ) : null}
                </label>
              );
            })}
          </fieldset>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="answer" className="text-sm font-medium">
              Your answer
            </label>
            {question.type === "NUMERIC" ? (
              <input
                id="answer"
                name="answer"
                inputMode="decimal"
                autoComplete="off"
                required
                disabled={answered}
                placeholder="e.g. 0.75"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
              />
            ) : (
              <Textarea id="answer" name="answer" rows={3} required disabled={answered} />
            )}
          </div>
        )}

        {error ? (
          <p role="alert" className="flex gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        {!answered ? (
          <Button type="submit" className="h-10 px-5" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {pending ? "Checking…" : "Submit"}
          </Button>
        ) : null}
      </form>

      {result ? (
        <div
          className={cn(
            "space-y-4 rounded-xl border px-4 py-4",
            result.correct
              ? "border-strong/30 bg-strong/5"
              : "border-destructive/30 bg-destructive/5",
          )}
          role="status"
        >
          <p
            className={cn(
              "flex items-center gap-2 font-medium",
              result.correct ? "text-strong" : "text-destructive",
            )}
          >
            {result.correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
            {result.correct
              ? result.score < 1
                ? "Partly right"
                : "Correct"
              : "Not quite"}
          </p>

          {!result.correct && result.type !== "MULTIPLE_CHOICE" ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Correct answer: </span>
              <span className="font-medium">{result.correctAnswer}</span>
            </p>
          ) : null}

          {result.feedback ? (
            <p className="text-sm text-pretty">{result.feedback}</p>
          ) : null}

          {!result.correct && result.hint ? (
            <p className="text-sm text-pretty">
              <span className="text-muted-foreground">Hint: </span>
              {result.hint}
            </p>
          ) : null}

          <div className="border-t border-border/60 pt-3">
            <p className="text-sm leading-relaxed text-pretty">{result.explanation}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isLast ? (
              <Button asChild className="h-9">
                <Link href={`/courses/${courseId}`}>Finish</Link>
              </Button>
            ) : (
              <Button type="button" className="h-9" onClick={goNext}>
                Next question
                <ArrowRight aria-hidden />
              </Button>
            )}

            <form action={reportQuestionAction}>
              <input type="hidden" name="questionId" value={question.id} />
              <input type="hidden" name="courseId" value={courseId} />
              <Button type="submit" variant="ghost" size="sm">
                <Flag aria-hidden />
                This question looks wrong
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
