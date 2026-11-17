"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Google } from "@/components/ui/google";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type LoginProps = {
  callbackURL?: string;
  className?: string;
};

export default function Login({ callbackURL = "/", className }: LoginProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (isPending) return;

    setIsPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });

      if (result.error) {
        setError("We couldn't connect to Google. Please try again.");
        setIsPending(false);
      }
    } catch {
      setError("Unable to sign in. Check your connection and try again.");
      setIsPending(false);
    }
  }

  return (
    <section
      aria-label="Sign in"
      aria-busy={isPending}
      className={cn("flex w-full max-w-sm flex-col gap-8", className)}
    >
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome to chalk.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Sign in to learn with chalk and keep your lessons
          together.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={isPending}
          onClick={signIn}
        >
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : (
            <Google aria-hidden="true" data-icon="inline-start" />
          )}
          Continue with Google
        </Button>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Your lessons will be saved to your account.
        </p>
      </div>
    </section>
  );
}
