-- =====================================================
-- vector_queries.sql : pgvector queries on stored embeddings
-- Run AFTER scripts/embed-notes.mjs has filled the embeddings.
-- Distance operator <=> is cosine distance; similarity = 1 - distance.
-- =====================================================

\echo '=== Vector column and index ==='
SELECT column_name, udt_name FROM information_schema.columns
WHERE table_name = 'checkin_note' AND column_name = 'embedding';
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'idx_note_embedding';

\echo '=== Notes with embeddings ==='
SELECT COUNT(*) AS total_notes, COUNT(embedding) AS embedded,
       vector_dims((SELECT embedding FROM checkin_note
                    WHERE embedding IS NOT NULL LIMIT 1)) AS dimensions
FROM checkin_note;

\echo '=== Notes most similar to note 1 (excluding itself) ==='
SELECT c.note_id, s.full_name,
       ROUND((1 - (c.embedding <=> (SELECT embedding FROM checkin_note WHERE note_id = 1)))::numeric, 3)
         AS similarity,
       c.note_text
FROM checkin_note c
JOIN staff s ON s.staff_id = c.staff_id
WHERE c.note_id <> 1 AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> (SELECT embedding FROM checkin_note WHERE note_id = 1)
LIMIT 5;

\echo '=== Notes similar to note 1 written by Medium/High-risk staff last week (vector + relational) ==='
SELECT c.note_id, s.full_name, b.score,
       ROUND((1 - (c.embedding <=> (SELECT embedding FROM checkin_note WHERE note_id = 1)))::numeric, 3)
         AS similarity
FROM checkin_note c
JOIN staff s ON s.staff_id = c.staff_id
JOIN burnout_score b ON b.staff_id = c.staff_id
WHERE b.week_start = date_trunc('week', CURRENT_DATE - 7)::date
  AND b.score >= 30
  AND c.note_id <> 1
  AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> (SELECT embedding FROM checkin_note WHERE note_id = 1)
LIMIT 5;

\echo '=== Query plan: nearest-neighbour search uses the HNSW index ==='
SET enable_seqscan = off;
EXPLAIN
SELECT note_id FROM checkin_note
ORDER BY embedding <=> (SELECT embedding FROM checkin_note WHERE note_id = 1)
LIMIT 5;
RESET enable_seqscan;
