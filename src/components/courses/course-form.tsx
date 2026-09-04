"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CourseFormState } from "@/app/(app)/courses/actions";
import { TARGET_GRADES } from "@/lib/validation/course";

const INITIAL: CourseFormState = {};

export type CourseFormValues = {
  courseId?: string;
  name: string;
  code: string;
  examDate: string;
  targetGrade: string;
  weeklyStudyHours: string;
};

export function CourseForm({
  action,
  defaults,
  submitLabel,
  cancelHref,
}: {
  action: (state: CourseFormState, formData: FormData) => Promise<CourseFormState>;
  defaults: CourseFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert error={state.error} />

      {defaults.courseId ? (
        <input type="hidden" name="courseId" value={defaults.courseId} />
      ) : null}

      <Field
        id="name"
        name="name"
        label="Course name"
        placeholder="Discrete Mathematics"
        defaultValue={defaults.name}
        autoComplete="off"
        required
        error={state.fieldErrors?.name}
      />

      <Field
        id="code"
        name="code"
        label="Course code"
        placeholder="MATH1061"
        defaultValue={defaults.code}
        autoComplete="off"
        required
        hint="However your university writes it."
        error={state.fieldErrors?.code}
      />

      <Field
        id="examDate"
        name="examDate"
        type="date"
        label="Exam date"
        defaultValue={defaults.examDate}
        required
        error={state.fieldErrors?.examDate}
      />

      <div className="space-y-1.5">
        <Label htmlFor="targetGrade">Target grade</Label>
        <Select name="targetGrade" defaultValue={defaults.targetGrade}>
          <SelectTrigger id="targetGrade" className="w-full">
            <SelectValue placeholder="Choose a grade" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_GRADES.map((grade) => (
              <SelectItem key={grade.value} value={grade.value}>
                {grade.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.fieldErrors?.targetGrade ? (
          <p className="text-xs text-destructive">{state.fieldErrors.targetGrade}</p>
        ) : null}
      </div>

      <Field
        id="weeklyStudyHours"
        name="weeklyStudyHours"
        type="number"
        inputMode="numeric"
        min={1}
        max={60}
        step={0.5}
        label="Study time available"
        defaultValue={defaults.weeklyStudyHours}
        required
        hint="Hours per week. Your daily plan is built to fit this."
        error={state.fieldErrors?.weeklyStudyHours}
      />

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button asChild variant="ghost" className="h-9 sm:w-auto">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <div className="sm:w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
