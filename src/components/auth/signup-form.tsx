"use client";

import { useActionState } from "react";
import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";

const INITIAL: AuthFormState = {};

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert error={state.error} success={state.success} />

      <Field
        id="name"
        name="name"
        label="Name"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />
      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state.fieldErrors?.password}
      />

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
