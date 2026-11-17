CREATE TYPE "answer_status" AS ENUM('pending', 'complete', 'error');--> statement-breakpoint
CREATE TYPE "lesson_status" AS ENUM('planning', 'narration', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "narration_status" AS ENUM('pending', 'generating', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"plan" jsonb,
	"status" "lesson_status" DEFAULT 'planning'::"lesson_status" NOT NULL,
	"error" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"duration" double precision,
	"position" double precision DEFAULT 0 NOT NULL,
	"progress_revision" bigint DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lesson_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"status" "answer_status" DEFAULT 'pending'::"answer_status" NOT NULL,
	"error" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narration_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lesson_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"status" "narration_status" DEFAULT 'pending'::"narration_status" NOT NULL,
	"blob_path" text,
	"sample_count" integer,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lesson_user_created_idx" ON "lesson" ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_user_request_idx" ON "lesson" ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "question_lesson_created_idx" ON "lesson_question" ("lesson_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "narration_lesson_step_idx" ON "narration_segment" ("lesson_id","step");--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_question" ADD CONSTRAINT "lesson_question_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "narration_segment" ADD CONSTRAINT "narration_segment_lesson_id_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lesson"("id") ON DELETE CASCADE;