"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

const INITIAL: AuthFormState = {};

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert error={state.error} success={state.success} />

      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state.fieldErrors?.password}
      />
      <Field
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
