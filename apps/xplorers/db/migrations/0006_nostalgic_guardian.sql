CREATE TYPE "public"."personalization_question_type" AS ENUM('single', 'multi', 'text');--> statement-breakpoint
CREATE TABLE "personalization_answers" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"user_id" bigint NOT NULL,
	"question_id" bigint NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "personalization_answers_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "personalization_questions" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"prompt" text NOT NULL,
	"type" "personalization_question_type" NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "personalization_questions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "personalization_answers" ADD CONSTRAINT "personalization_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personalization_answers" ADD CONSTRAINT "personalization_answers_question_id_personalization_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."personalization_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personalization_answers_user_question_uidx" ON "personalization_answers" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "personalization_answers_user_idx" ON "personalization_answers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personalization_answers_question_idx" ON "personalization_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "personalization_questions_active_sort_idx" ON "personalization_questions" USING btree ("active","sort_order");--> statement-breakpoint
CREATE INDEX "personalization_questions_created_idx" ON "personalization_questions" USING btree ("created_at");