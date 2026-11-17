import { defineRelations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uuid,
  jsonb,
  integer,
  doublePrecision,
  bigint,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { LessonPlan } from "../lib/lesson/schema";

export const user = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const lessonStatus = pgEnum("lesson_status", [
  "planning",
  "narration",
  "ready",
  "error",
]);
export const narrationStatus = pgEnum("narration_status", [
  "pending",
  "generating",
  "ready",
  "error",
]);
export const answerStatus = pgEnum("answer_status", [
  "pending",
  "complete",
  "error",
]);

export const lesson = pgTable(
  "lesson",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    topic: text("topic").notNull(),
    title: text("title").notNull(),
    plan: jsonb("plan").$type<LessonPlan>(),
    status: lessonStatus("status").default("planning").notNull(),
    error: text("error"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    duration: doublePrecision("duration"),
    position: doublePrecision("position").default(0).notNull(),
    progressRevision: bigint("progress_revision", { mode: "number" })
      .default(0)
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("lesson_user_created_idx").on(
      table.userId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex("lesson_user_request_idx").on(table.userId, table.requestId),
  ],
);

export const narrationSegment = pgTable(
  "narration_segment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    status: narrationStatus("status").default("pending").notNull(),
    blobPath: text("blob_path"),
    sampleCount: integer("sample_count"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    error: text("error"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("narration_lesson_step_idx").on(table.lessonId, table.step),
  ],
);

// A question and its answer share one retry identifier and remain adjacent in history.
export const lessonQuestion = pgTable(
  "lesson_question",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    status: answerStatus("status").default("pending").notNull(),
    error: text("error"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("question_lesson_created_idx").on(
      table.lessonId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const relations = defineRelations(
  {
    user,
    session,
    account,
    verification,
    lesson,
    narrationSegment,
    lessonQuestion,
  },
  (r) => ({
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
      lessons: r.many.lesson(),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
        optional: false,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
        optional: false,
      }),
    },
    lesson: {
      user: r.one.user({
        from: r.lesson.userId,
        to: r.user.id,
        optional: false,
      }),
      segments: r.many.narrationSegment(),
      questions: r.many.lessonQuestion(),
    },
    narrationSegment: {
      lesson: r.one.lesson({
        from: r.narrationSegment.lessonId,
        to: r.lesson.id,
        optional: false,
      }),
    },
    lessonQuestion: {
      lesson: r.one.lesson({
        from: r.lessonQuestion.lessonId,
        to: r.lesson.id,
        optional: false,
      }),
    },
  }),
);
