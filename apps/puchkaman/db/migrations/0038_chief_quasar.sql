ALTER TYPE "public"."app_event" ADD VALUE 'email_verification_link';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'email_otp_password_reset';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'email_otp_verification';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'account_deletion_confirm';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'password_changed';--> statement-breakpoint
ALTER TYPE "public"."app_event" ADD VALUE 'new_login_alert';