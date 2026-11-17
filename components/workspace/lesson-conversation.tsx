"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, BookOpen, LoaderCircle, MessageCircle } from "lucide-react";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { lessonRequest, postLessonRequest } from "@/lib/lesson/client";
import { formatTime, type LessonTiming } from "@/lib/lesson/audio";
import {
  savedQuestionSchema,
  type SavedQuestion,
  type ChatMessage,
  type LessonPlan,
} from "@/lib/lesson/schema";
import { cn } from "@/lib/utils";

type LessonConversationProps = {
  lesson: LessonPlan;
  lessonId: string;
  initialQuestions: SavedQuestion[];
  timings: LessonTiming[];
  step: number;
  onSeek: (time: number) => void;
};
type DisplayMessage = ChatMessage & { id: string };
type QuestionRequest = { question: string; questionId: string };

export function LessonConversation({
  lesson,
  lessonId,
  initialQuestions,
  timings,
  step,
  onSeek,
}: LessonConversationProps) {
  const [question, setQuestion] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["lesson-questions", lessonId];
  const activeRequest = useRef(false);
  const turns = useQuery({
    queryKey,
    initialData: initialQuestions,
    staleTime: 0,
    queryFn: async ({ signal }) =>
      z
        .array(savedQuestionSchema)
        .parse(
          await (
            await lessonRequest(`/api/lessons/${lessonId}/questions`, {
              signal,
            })
          ).json(),
        ),
    refetchInterval: (query) =>
      !activeRequest.current &&
      query.state.data?.some((item) => item.status === "pending")
        ? 2000
        : false,
  });
  const messages: DisplayMessage[] = (turns.data ?? []).flatMap((item) => [
    {
      id: item.id + "-question",
      role: "user" as const,
      content: item.question,
    },
    ...(item.answer
      ? [
          {
            id: item.id + "-answer",
            role: "assistant" as const,
            content: item.answer,
          },
        ]
      : []),
  ]);
  const controllerRef = useRef<AbortController | null>(null);
  const editingRef = useRef<string | null>(null);
  const failed = turns.data?.find((item) => item.status === "error");
  const pending =
    turns.data?.some((item) => item.status === "pending") ?? false;
  const mutation = useMutation({
    retry: false,
    mutationFn: async (body: QuestionRequest) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return savedQuestionSchema.parse(
        await (
          await postLessonRequest(
            "/api/lessons/questions",
            { ...body, lessonId },
            controller.signal,
          )
        ).json(),
      );
    },
    onMutate: async (body) => {
      activeRequest.current = true;
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<SavedQuestion[]>(queryKey, (old = []) => [
        ...old.filter((item) => item.id !== body.questionId),
        {
          id: body.questionId,
          question: body.question,
          answer: null,
          status: "pending",
          error: null,
        },
      ]);
    },
    onSettled: () => {
      activeRequest.current = false;
      void queryClient.invalidateQueries({ queryKey });
    },
    onSuccess: (turn) => {
      queryClient.setQueryData<SavedQuestion[]>(queryKey, (old = []) =>
        old.map((item) => (item.id === turn.id ? turn : item)),
      );
    },
    onError: (error, body) => {
      queryClient.setQueryData<SavedQuestion[]>(queryKey, (old = []) =>
        old.map((item) =>
          item.id === body.questionId
            ? { ...item, status: "error", error: error.message }
            : item,
        ),
      );
    },
  });

  useEffect(() => () => controllerRef.current?.abort(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || mutation.isPending || pending) return;
    const body = {
      question: content,
      questionId: editingRef.current ?? crypto.randomUUID(),
    };
    editingRef.current = null;
    setQuestion("");
    mutation.mutate(body);
  }

  function editFailedQuestion() {
    if (!failed) return;
    editingRef.current = failed.id;
    setQuestion(failed.question);
    mutation.reset();
  }

  return (
    <aside
      className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card xl:h-[780px]"
      aria-label="Lesson conversation"
    >
      <Tabs
        defaultValue="lesson"
        className="flex h-full min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border px-4 py-3">
          <TabsList className="w-full">
            <TabsTrigger value="lesson">
              <BookOpen />
              Lesson notes
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageCircle />
              Ask tutor
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="lesson" className="min-h-0 overflow-y-auto p-5">
          <div className="mb-6 flex flex-col gap-2">
            <h2 className="font-medium">What you’ll understand</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lesson.objective}
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {lesson.steps.map((item, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onSeek(timings[index].start)}
                  aria-current={step === index ? "step" : undefined}
                  className={cn(
                    "flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    step === index && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums text-muted-foreground",
                      step === index &&
                        "border-primary/20 bg-primary text-primary-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatTime(timings[index].start)}
                      </span>
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {item.narration}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2 text-xs font-medium text-primary">
              The idea to keep
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {lesson.takeaway}
            </p>
          </div>
        </TabsContent>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-60 flex-1">
            <MessageScrollerProvider autoScroll>
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent className="gap-5 p-5">
                    {messages.length === 0 && (
                      <MessageScrollerItem messageId="chat-empty">
                        <Empty className="px-2 py-8">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <MessageCircle />
                            </EmptyMedia>
                            <EmptyTitle>What would help it click?</EmptyTitle>
                            <EmptyDescription>
                              Ask for another example, a simpler explanation, or
                              the part you missed.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </MessageScrollerItem>
                    )}
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        <Message
                          align={message.role === "user" ? "end" : "start"}
                        >
                          <MessageContent>
                            <MessageHeader>
                              {message.role === "user" ? "You" : "Your tutor"}
                            </MessageHeader>
                            <Bubble
                              variant={
                                message.role === "user" ? "default" : "muted"
                              }
                              align={message.role === "user" ? "end" : "start"}
                            >
                              <BubbleContent className="whitespace-pre-wrap">
                                {message.content}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    ))}
                    {(mutation.isPending || pending) && (
                      <MessageScrollerItem messageId="answer-loading">
                        <p
                          role="status"
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <LoaderCircle className="size-4 motion-safe:animate-spin" />
                          Your tutor is thinking…
                        </p>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </div>
          {(failed || turns.isError) && (
            <div className="px-4 pb-3">
              <Alert variant="destructive">
                <AlertDescription>
                  {failed?.error ?? turns.error?.message}
                </AlertDescription>
              </Alert>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (failed)
                      mutation.mutate({
                        question: failed.question,
                        questionId: failed.id,
                      });
                    else void turns.refetch();
                  }}
                >
                  Retry answer
                </Button>
                <Button variant="ghost" size="sm" onClick={editFailedQuestion}>
                  Edit question
                </Button>
              </div>
            </div>
          )}
          <form onSubmit={submit} className="border-t border-border p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="follow-up" className="sr-only">
                  Ask a follow-up question
                </FieldLabel>
                <InputGroup>
                  <InputGroupTextarea
                    id="follow-up"
                    placeholder="What are you wondering about?"
                    rows={2}
                    maxLength={1500}
                    value={question}
                    disabled={mutation.isPending || pending}
                    onChange={(event) => setQuestion(event.target.value)}
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
                    <InputGroupButton
                      type="submit"
                      variant="default"
                      size="icon-sm"
                      className="ml-auto"
                      disabled={
                        !question.trim() || mutation.isPending || pending
                      }
                      aria-label="Send question"
                    >
                      <ArrowUp />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  AI can make mistakes. Ask when something is unclear.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
