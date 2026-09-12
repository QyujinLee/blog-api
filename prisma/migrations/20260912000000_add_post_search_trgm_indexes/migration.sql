-- 검색(PostService.search)은 한글 형태소 문제로 to_tsvector를 못 쓰고 title/body에
-- ILIKE '%q%' 부분일치를 쓴다. btree 인덱스는 앞이 고정되지 않은 LIKE엔 걸리지 않아
-- 글이 쌓이면 매 검색이 Post 전체 풀스캔이 된다. pg_trgm GIN 인덱스는 '%...%' 패턴에도 걸린다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Post_title_trgm_idx" ON "Post" USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Post_body_trgm_idx" ON "Post" USING gin (body gin_trgm_ops);
