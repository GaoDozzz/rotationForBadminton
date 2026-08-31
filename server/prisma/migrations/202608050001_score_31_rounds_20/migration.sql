ALTER TABLE "event_drafts" DROP CONSTRAINT "event_drafts_score_to_check";
ALTER TABLE "event_drafts" DROP CONSTRAINT "event_drafts_rounds_check";
ALTER TABLE "events" DROP CONSTRAINT "events_score_to_check";
ALTER TABLE "events" DROP CONSTRAINT "events_rounds_check";

ALTER TABLE "event_drafts" ADD CONSTRAINT "event_drafts_score_to_check" CHECK ("score_to" IN (11,15,21,31));
ALTER TABLE "event_drafts" ADD CONSTRAINT "event_drafts_rounds_check" CHECK ("rounds" BETWEEN 1 AND 20);
ALTER TABLE "events" ADD CONSTRAINT "events_score_to_check" CHECK ("score_to" IN (11,15,21,31));
ALTER TABLE "events" ADD CONSTRAINT "events_rounds_check" CHECK ("rounds" BETWEEN 1 AND 20);
