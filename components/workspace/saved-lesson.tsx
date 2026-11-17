import { TutorWorkspace } from "./tutor-workspace";
export async function SavedLesson({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TutorWorkspace key={id} initialLessonId={id} />;
}
