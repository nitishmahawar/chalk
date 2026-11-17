"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, AudioLines, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  InputGroupText,
} from "@/components/ui/input-group";

const suggestions = [
  "Why is the sky blue?",
  "How do fractions work?",
  "Explain neural networks",
];

export function TopicComposer({
  onGenerate,
}: {
  onGenerate: (topic: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (topic.trim().length >= 3) onGenerate(topic.trim());
  }
  function selectTopic(value: string) {
    setTopic(value);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-10 lg:py-16">
      <div className="workspace-enter flex w-full max-w-2xl flex-col gap-9">
        <div className="flex flex-col gap-5">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 text-primary">
            <Lightbulb className="size-6" strokeWidth={1.5} />
          </div>
          <h1 className="max-w-xl text-4xl font-medium leading-[1.15] tracking-[-0.035em] text-balance sm:text-5xl">
            Big ideas.
            <br />
            <span className="text-muted-foreground">A little clearer.</span>
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
            Pick something you’re curious about. Your tutor will draw it out,
            one step at a time.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="lesson-topic" className="sr-only">
                  What would you like to learn?
                </FieldLabel>
                <InputGroup className="topic-input">
                  <InputGroupTextarea
                    ref={inputRef}
                    id="lesson-topic"
                    value={topic}
                    onChange={(event) => {
                      setTopic(event.target.value);
                    }}
                    placeholder="What would you like to understand?"
                    maxLength={300}
                    rows={3}
                    className="min-h-28"
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <InputGroupAddon align="block-end">
                    <InputGroupText>
                      <AudioLines aria-hidden="true" />
                      <span>About 2 minutes · visual + voice</span>
                    </InputGroupText>
                    <InputGroupButton
                      type="submit"
                      variant="default"
                      size="icon-sm"
                      className="ml-auto"
                      disabled={topic.trim().length < 3}
                      aria-label="Create a lesson"
                    >
                      <ArrowUp />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
          </form>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                size="sm"
                variant="outline"
                onClick={() => selectTopic(suggestion)}
              >
                {suggestion}
                <ArrowRight data-icon="inline-end" />
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Lessons, narration, and questions are saved to your account.
        </p>
      </div>
    </div>
  );
}
