CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS gov;

CREATE TABLE IF NOT EXISTS gov.memory_documents (
  memory_id text PRIMARY KEY,
  namespace text NOT NULL,
  topic text NOT NULL,
  summary text,
  mission_id text,
  role text,
  actor text,
  source_type text NOT NULL DEFAULT 'udn',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov.memory_chunks (
  chunk_id text PRIMARY KEY,
  memory_id text NOT NULL REFERENCES gov.memory_documents(memory_id) ON DELETE CASCADE,
  namespace text NOT NULL,
  topic text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_memory_documents_namespace_topic
  ON gov.memory_documents(namespace, topic, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gov_memory_documents_mission
  ON gov.memory_documents(mission_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gov_memory_chunks_namespace
  ON gov.memory_chunks(namespace, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gov_memory_chunks_tags
  ON gov.memory_chunks USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_gov_memory_chunks_embedding_hnsw
  ON gov.memory_chunks USING hnsw (embedding vector_cosine_ops);
