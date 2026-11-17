"use client";

import Link from "next/link";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { lessonListSchema } from "@/lib/lesson/schema";
import { lessonRequest } from "@/lib/lesson/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BookOpen, ChevronUp, LogOut, Plus, SquarePen } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type WorkspaceSidebarProps = {
  currentLessonId?: string;
  onNewLesson: () => void;
};

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function WorkspaceSidebar({
  currentLessonId,
  onNewLesson,
}: WorkspaceSidebarProps) {
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const history = useInfiniteQuery({
    queryKey: ["lessons", session?.user.id],
    enabled: !!session?.user.id,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      lessonListSchema.parse(
        await (
          await lessonRequest(
            `/api/lessons${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
          )
        ).json(),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const { theme, setTheme } = useTheme();
  const { setOpenMobile } = useSidebar();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = session?.user.name || "Your account";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function navigate(action: () => void) {
    action();
    setOpenMobile(false);
  }

  async function signOut() {
    setSigningOut(true);
    setError(null);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Couldn’t sign out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-8 px-5 pb-5 pt-7">
        <button
          type="button"
          onClick={() => navigate(onNewLesson)}
          className="flex w-fit items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="chalk home"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <SquarePen className="size-4" strokeWidth={1.8} />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            chalk<span className="text-primary">.</span>
          </span>
        </button>
        <Button onClick={() => navigate(onNewLesson)} className="w-full">
          <Plus data-icon="inline-start" />
          New lesson
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupLabel>Your lessons</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {history.data?.pages
                .flatMap((page) => page.items)
                .map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={currentLessonId === item.id}
                      render={
                        <Link
                          href={`/lessons/${item.id}`}
                          onClick={(event) => {
                            if (currentLessonId === item.id)
                              event.preventDefault();
                            setOpenMobile(false);
                          }}
                        />
                      }
                      className="h-auto py-3"
                    >
                      <BookOpen />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate">{item.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.status === "ready"
                            ? item.completedAt
                              ? "Completed"
                              : "Ready to play"
                            : item.status === "error"
                              ? "Retry preparation"
                              : "Resume preparation"}
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
            {history.isPending && (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                Loading lessons...
              </p>
            )}
            {history.isError && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void history.refetch()}
              >
                Retry loading lessons
              </Button>
            )}
            {history.data?.pages[0].items.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                Your saved lessons will appear here.
              </p>
            )}
            {history.hasNextPage && (
              <Button
                variant="ghost"
                size="sm"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                Load more
              </Button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
        {error && (
          <p role="alert" className="px-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <Popover>
          <PopoverTrigger
            aria-label="Open profile menu"
            render={
              <Button
                variant="ghost"
                className="h-auto w-full justify-start py-2"
              />
            }
          >
            <Avatar>
              <AvatarImage src={session?.user.image ?? undefined} alt={name} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 items-start">
              <span className="max-w-full truncate text-sm">{name}</span>
            </span>
            <ChevronUp data-icon="inline-end" />
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="max-w-[calc(100vw-2rem)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size="lg">
                <AvatarImage
                  src={session?.user.image ?? undefined}
                  alt={name}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <PopoverTitle className="wrap-anywhere">{name}</PopoverTitle>
                <PopoverDescription className="text-xs wrap-anywhere">
                  {session?.user.email}
                </PopoverDescription>
              </div>
            </div>
            <Separator />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-theme">Appearance</FieldLabel>
                <Select
                  items={themeOptions}
                  value={theme ?? "system"}
                  onValueChange={(value) => {
                    if (value) setTheme(value);
                  }}
                >
                  <SelectTrigger id="profile-theme" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {themeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Separator />
            <Button
              variant="destructive"
              className="w-full justify-start"
              disabled={signingOut}
              onClick={signOut}
            >
              <LogOut data-icon="inline-start" />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </PopoverContent>
        </Popover>
      </SidebarFooter>
    </Sidebar>
  );
}
