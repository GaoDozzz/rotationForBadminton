SET ROLE zzjl_owner;

ALTER TABLE "events" ADD COLUMN "description" VARCHAR(500);

RESET ROLE;
