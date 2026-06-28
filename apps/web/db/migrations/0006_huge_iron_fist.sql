ALTER TYPE "public"."audit_operation" ADD VALUE 'read';--> statement-breakpoint
ALTER TYPE "public"."audit_operation" ADD VALUE 'login';--> statement-breakpoint
ALTER TYPE "public"."audit_operation" ADD VALUE 'logout';--> statement-breakpoint
ALTER TYPE "public"."audit_operation" ADD VALUE 'login_failed';