-- Volledig schema voor een nieuwe installatie (deploy_setup.py).
-- Wijzigingen aan een bestaande database gaan via sql/migrations/ (npm run db:migrate);
-- houd dit bestand gelijk met de laatste migratie.

CREATE DATABASE IF NOT EXISTS referentie
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE referentie;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ref_items (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'article',
  title VARCHAR(1024) NOT NULL,
  abstract TEXT NULL,
  year SMALLINT NULL,
  journal VARCHAR(512) NULL,
  volume VARCHAR(64) NULL,
  issue VARCHAR(64) NULL,
  pages VARCHAR(64) NULL,
  doi VARCHAR(255) NULL,
  url VARCHAR(2048) NULL,
  pmid VARCHAR(32) NULL,
  cite_key VARCHAR(128) NULL,
  status ENUM('unread', 'reading', 'read') NOT NULL DEFAULT 'unread',
  starred TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  label TINYINT UNSIGNED NULL DEFAULT NULL,
  retraction_type VARCHAR(32) NULL,
  retraction_doi VARCHAR(255) NULL,
  retraction_date DATE NULL,
  retraction_checked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ref_user (user_id),
  INDEX idx_ref_user_status (user_id, status),
  INDEX idx_ref_user_starred (user_id, starred),
  INDEX idx_ref_user_deleted (user_id, deleted_at),
  INDEX idx_ref_user_label (user_id, label),
  FULLTEXT idx_ref_search (title, abstract, journal)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS authors (
  id CHAR(36) PRIMARY KEY,
  given_name VARCHAR(255) NOT NULL DEFAULT '',
  family_name VARCHAR(255) NOT NULL DEFAULT '',
  name_key VARCHAR(511) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    AS (CONCAT(given_name, '|', family_name)) STORED,
  UNIQUE KEY uq_author_name (name_key),
  INDEX idx_author_family (family_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reference_authors (
  reference_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (reference_id, position),
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE,
  INDEX idx_ra_ref (reference_id),
  INDEX idx_ra_author (author_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id CHAR(36) PRIMARY KEY,
  reference_id CHAR(36) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  storage_path VARCHAR(1024) NOT NULL,
  mime VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  page_count INT NULL,
  full_text MEDIUMTEXT NULL,
  position INT NOT NULL DEFAULT 0,
  label VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  INDEX idx_att_ref (reference_id),
  FULLTEXT ft_att_text (full_text)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notes (
  id CHAR(36) PRIMARY KEY,
  reference_id CHAR(36) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  UNIQUE KEY uq_note_ref (reference_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS highlights (
  id CHAR(36) PRIMARY KEY,
  attachment_id CHAR(36) NOT NULL,
  page INT NOT NULL,
  quote TEXT NULL,
  color VARCHAR(16) NOT NULL DEFAULT 'yellow',
  rects JSON NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
  INDEX idx_hl_att (attachment_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ref_groups (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  kind ENUM('manual', 'smart') NOT NULL DEFAULT 'manual',
  rules JSON NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES ref_groups(id) ON DELETE CASCADE,
  INDEX idx_groups_user (user_id, kind, position)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS group_items (
  group_id CHAR(36) NOT NULL,
  reference_id CHAR(36) NOT NULL,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, reference_id),
  FOREIGN KEY (group_id) REFERENCES ref_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  INDEX idx_gi_ref (reference_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tag_user_name (user_id, name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reference_tags (
  reference_id CHAR(36) NOT NULL,
  tag_id CHAR(36) NOT NULL,
  PRIMARY KEY (reference_id, tag_id),
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  INDEX idx_rt_tag (tag_id)
) ENGINE=InnoDB;
