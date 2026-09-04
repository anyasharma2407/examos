"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthFormState } from "@/app/(auth)/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

const INITIAL: AuthFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert error={state.error} success={state.success} />

      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
