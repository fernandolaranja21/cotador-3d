-- Cotador 3D: uma tabela de documentos JSON (config, filamentos, orcamentos)
CREATE TABLE IF NOT EXISTS docs (
  col        TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS docs_col_updated ON docs (col, updated_at);
