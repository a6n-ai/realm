-- Widen the per-id sequence from 10 bits (% 1024) to the full low 23 bits
-- (% 8388608), reclaiming the unused shard field (shard_id was hardcoded to 1).
-- The old 1024-per-millisecond ceiling let the sequence wrap inside a single
-- millisecond, producing non-monotonic and occasionally colliding ids under a
-- burst. Widening pushes that boundary out 8192x. Same 64-bit width, still
-- k-sortable; existing ids are unaffected (the clock only moves forward).
CREATE OR REPLACE FUNCTION next_id(OUT result bigint) AS $$
DECLARE
  our_epoch  bigint := 1735689600000;
  seq_id     bigint;
  now_millis bigint;
BEGIN
  SELECT nextval('id_seq') % 8388608 INTO seq_id;
  SELECT floor(extract(epoch FROM clock_timestamp()) * 1000) INTO now_millis;
  result := (now_millis - our_epoch) << 23;
  result := result | seq_id;
END;
$$ LANGUAGE plpgsql;
