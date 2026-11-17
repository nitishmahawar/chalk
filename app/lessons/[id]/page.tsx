import { Suspense } from "react";
import { SavedLesson } from "@/components/workspace/saved-lesson";
export default function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"
        >
          Loading your lesson...
        </div>
      }
    >
      <SavedLesson params={params} />
    </Suspense>
  );
}
