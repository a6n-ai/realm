CREATE TABLE "public_faqs" (
	"id" bigint PRIMARY KEY DEFAULT next_id() NOT NULL,
	"public_id" text NOT NULL,
	"app_id" bigint DEFAULT current_app_id() NOT NULL,
	"created_at" bigint NOT NULL,
	"created_by" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by" bigint,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"organization_id" text,
	CONSTRAINT "public_faqs_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "public_faqs" ADD CONSTRAINT "public_faqs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Seed brand-level rows (organization_id NULL) reproducing today's hardcoded
-- lib/faq.ts content, so switching to the DB-backed FAQ changes nothing until
-- an admin edits it. Same WHERE EXISTS ("app") guard as 0006's delivery seed —
-- a fresh database with no app row migrates cleanly without seeding.
INSERT INTO "public_faqs"
  ("public_id","created_at","updated_at","question","answer","sort_order")
SELECT v.public_id, ms.t, ms.t, v.question, v.answer, v.sort
FROM (SELECT (EXTRACT(EPOCH FROM now())*1000)::bigint AS t) ms,
     (VALUES
       ('faq_hours', 'What are Puchkaman''s hours?', 'We''re open Sunday–Thursday 3:00pm–2:00am and Friday–Saturday 3:00pm–3:00am at 3315 Danforth Ave, Scarborough, ON.', 0),
       ('faq_delivery', 'Do you deliver, and how far?', 'Yes. Order direct and we deliver ourselves — instantly within 7km at 15% off, or on a scheduled time slot beyond 7km with a $35 order minimum. For the rest of the GTA, find us on Uber Eats and DoorDash.', 1),
       ('faq_pickup', 'How long does pickup take?', 'About 15 minutes from ordering — order ahead online, walk in, walk out.', 2),
       ('faq_catering', 'Do you do catering?', 'Yes — live puchka and chaat stations for birthdays, weddings, offices, private and community events across the GTA. Submit a quote request and we reply within 24 hours.', 3),
       ('faq_vegetarian', 'Do you offer vegetarian options?', 'Yes — vegetarian puchkas like Corn Cheese, Paneer Schezwan, Mushroom Blast, Veg Mo-Puchka, Aloo, and Dahi Puchka, plus sweet options like Chocolate and Strawberry Puchka. We prepare food in a shared kitchen, so let us know about any dietary restrictions if that matters for your order.', 4),
       ('faq_payment', 'How do I pay for an online order?', 'Online pickup and delivery orders are paid by card at checkout.', 5),
       ('faq_allergies', 'Can you accommodate food allergies?', 'Let us know about any allergies or dietary restrictions in the catering request form and we''ll do our best to accommodate. We prepare food in a shared kitchen, so we can''t guarantee a completely allergen-free environment — if you have a serious allergy, please contact us directly before ordering.', 6),
       ('faq_schedule', 'Can I schedule an order?', 'Delivery beyond our instant 7km radius is scheduled — you pick a time slot at checkout, anywhere from an hour out to this time tomorrow. We don''t book further than a day ahead. Pickup and instant delivery within 7km are same-day only (pickup is ready in about 15 minutes), not schedulable in advance.', 7)
     ) AS v(public_id, question, answer, sort)
WHERE EXISTS (SELECT 1 FROM "app");