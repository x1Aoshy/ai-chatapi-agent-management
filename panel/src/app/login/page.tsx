import { Suspense } from "react";
import type { Metadata } from "next";

import { Signature, Wordmark } from "@/components/wordmark";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark size="lg" />
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <Signature className="mt-6 text-center" />
      </div>
    </div>
  );
}
