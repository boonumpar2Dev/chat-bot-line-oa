-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to retrievable content tables (1536 dims = gemini-embedding-001 MRL-truncated, within pgvector HNSW limit)
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_text text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

ALTER TABLE public.catering_packages
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_text text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_text text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- HNSW cosine indexes (only build once data exists; safe to create now on empty embeddings)
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON public.knowledge_base USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS catering_packages_embedding_idx
  ON public.catering_packages USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS promotions_embedding_idx
  ON public.promotions USING hnsw (embedding vector_cosine_ops);

-- Match functions — return top-K rows by cosine similarity
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  min_similarity float DEFAULT 0.0
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT k.id, 1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base k
  WHERE k.embedding IS NOT NULL AND k.status = 'active'
    AND 1 - (k.embedding <=> query_embedding) >= min_similarity
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_catering_packages(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.0
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p.id, 1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.catering_packages p
  WHERE p.embedding IS NOT NULL AND p.is_active = true
    AND 1 - (p.embedding <=> query_embedding) >= min_similarity
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_promotions(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.0
)
RETURNS TABLE (id uuid, similarity float)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT pr.id, 1 - (pr.embedding <=> query_embedding) AS similarity
  FROM public.promotions pr
  WHERE pr.embedding IS NOT NULL AND pr.is_active = true
    AND 1 - (pr.embedding <=> query_embedding) >= min_similarity
  ORDER BY pr.embedding <=> query_embedding
  LIMIT match_count;
$$;