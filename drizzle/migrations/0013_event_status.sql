DO $$ BEGIN
  CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "tb_events"
  ADD COLUMN IF NOT EXISTS "status" event_status NOT NULL DEFAULT 'draft';

UPDATE "tb_events"
SET "status" = 'published'
WHERE "is_published" = true AND "status" = 'draft';
