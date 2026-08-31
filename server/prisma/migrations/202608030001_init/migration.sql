-- Prisma 先以 zzjl_migrator 创建并持有 _prisma_migrations，随后本文件
-- 切换到无登录的业务对象所有者。Prisma 会在同一迁移流程中更新状态，
-- 因此只授予 owner 读取和更新当前迁移记录所需的最小权限。
GRANT SELECT, UPDATE ON TABLE "_prisma_migrations" TO zzjl_owner;

SET ROLE zzjl_owner;

CREATE TYPE "MatchFormat" AS ENUM ('SINGLES', 'DOUBLES');
CREATE TYPE "RegistrationMode" AS ENUM ('WECHAT_SELF_SERVICE', 'ORGANIZER_MANAGED');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'SCHEDULE_READY', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "ParticipantSource" AS ENUM ('WECHAT_SELF_SERVICE', 'ORGANIZER_ENTRY');
CREATE TYPE "ParticipantStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'ACTIVE', 'WITHDRAWN');
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'SCORE_PENDING', 'SCORE_DISPUTED', 'WALKOVER', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MatchSide" AS ENUM ('A', 'B');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "openid" VARCHAR(128),
  "nickname" VARCHAR(40) NOT NULL,
  "gender" "Gender",
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "owner_id" UUID NOT NULL,
  "title" VARCHAR(40) NOT NULL, "match_format" "MatchFormat" NOT NULL,
  "registration_mode" "RegistrationMode" NOT NULL, "capacity" INTEGER,
  "court_count" INTEGER NOT NULL, "score_to" INTEGER NOT NULL, "rounds" INTEGER NOT NULL,
  "payload" JSONB NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL, CONSTRAINT "event_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organizer_id" UUID NOT NULL,
  "title" VARCHAR(40) NOT NULL, "share_code" VARCHAR(24) NOT NULL,
  "match_format" "MatchFormat" NOT NULL, "registration_mode" "RegistrationMode" NOT NULL,
  "status" "EventStatus" NOT NULL, "capacity" INTEGER, "court_count" INTEGER NOT NULL,
  "score_to" INTEGER NOT NULL, "rounds" INTEGER NOT NULL, "schedule_version" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ, "finished_at" TIMESTAMPTZ, "deleted_at" TIMESTAMPTZ,
  "deleted_by_id" UUID, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL, CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "event_id" UUID NOT NULL, "user_id" UUID,
  "participant_number" VARCHAR(20) NOT NULL, "nickname" VARCHAR(20) NOT NULL,
  "gender" "Gender" NOT NULL, "level" VARCHAR(30), "source" "ParticipantSource" NOT NULL,
  "status" "ParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "withdrawn_at" TIMESTAMPTZ,
  CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "event_id" UUID NOT NULL,
  "round_number" INTEGER NOT NULL, "court_number" INTEGER NOT NULL,
  "schedule_version" INTEGER NOT NULL, "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
  "team_a_score" INTEGER, "team_b_score" INTEGER, "result_type" VARCHAR(20),
  "started_at" TIMESTAMPTZ, "completed_at" TIMESTAMPTZ, "confirmed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "match_players" (
  "match_id" UUID NOT NULL, "participant_id" UUID NOT NULL, "side" "MatchSide" NOT NULL,
  "position" INTEGER NOT NULL, CONSTRAINT "match_players_pkey" PRIMARY KEY ("match_id", "participant_id")
);

CREATE TABLE "audit_logs" (
  "id" BIGSERIAL NOT NULL, "event_id" UUID, "actor_id" UUID, "action" VARCHAR(80) NOT NULL,
  "entity_type" VARCHAR(40) NOT NULL, "entity_id" VARCHAR(64) NOT NULL,
  "before" JSONB, "after" JSONB, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");
CREATE INDEX "event_drafts_owner_id_updated_at_idx" ON "event_drafts"("owner_id", "updated_at" DESC);
CREATE UNIQUE INDEX "events_share_code_key" ON "events"("share_code");
CREATE INDEX "events_organizer_id_status_updated_at_idx" ON "events"("organizer_id", "status", "updated_at" DESC);
CREATE INDEX "events_deleted_at_idx" ON "events"("deleted_at");
CREATE UNIQUE INDEX "participants_event_id_participant_number_key" ON "participants"("event_id", "participant_number");
CREATE UNIQUE INDEX "participants_event_id_user_id_key" ON "participants"("event_id", "user_id");
CREATE INDEX "participants_event_id_status_idx" ON "participants"("event_id", "status");
CREATE UNIQUE INDEX "matches_event_id_schedule_version_round_number_court_number_key" ON "matches"("event_id", "schedule_version", "round_number", "court_number");
CREATE INDEX "matches_event_id_status_round_number_court_number_idx" ON "matches"("event_id", "status", "round_number", "court_number");
CREATE UNIQUE INDEX "match_players_match_id_side_position_key" ON "match_players"("match_id", "side", "position");
CREATE INDEX "match_players_participant_id_idx" ON "match_players"("participant_id");
CREATE INDEX "audit_logs_event_id_created_at_idx" ON "audit_logs"("event_id", "created_at" DESC);

ALTER TABLE "event_drafts" ADD CONSTRAINT "event_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT;
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "matches" ADD CONSTRAINT "matches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "event_drafts" ADD CONSTRAINT "event_drafts_score_to_check" CHECK ("score_to" IN (11,15,21));
ALTER TABLE "event_drafts" ADD CONSTRAINT "event_drafts_rounds_check" CHECK ("rounds" BETWEEN 1 AND 10);
ALTER TABLE "events" ADD CONSTRAINT "events_score_to_check" CHECK ("score_to" IN (11,15,21));
ALTER TABLE "events" ADD CONSTRAINT "events_rounds_check" CHECK ("rounds" BETWEEN 1 AND 10);
ALTER TABLE "events" ADD CONSTRAINT "events_court_count_check" CHECK ("court_count" > 0);

GRANT USAGE ON SCHEMA public TO zzjl_app, zzjl_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zzjl_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zzjl_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO zzjl_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE zzjl_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zzjl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zzjl_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO zzjl_app;
ALTER DEFAULT PRIVILEGES FOR ROLE zzjl_owner IN SCHEMA public GRANT SELECT ON TABLES TO zzjl_readonly;

-- Prisma 在执行完本文件后还会写入由 zzjl_migrator 持有的
-- _prisma_migrations 元数据表。这里必须恢复登录角色；否则会继续以
-- zzjl_owner 身份更新迁移元数据，并被 PostgreSQL 的最小权限策略拒绝。
RESET ROLE;
