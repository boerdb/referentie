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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ref_user (user_id),
  INDEX idx_ref_user_status (user_id, status),
  INDEX idx_ref_user_starred (user_id, starred),
  FULLTEXT idx_ref_search (title, abstract, journal)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS authors (
  id CHAR(36) PRIMARY KEY,
  given_name VARCHAR(255) NOT NULL DEFAULT '',
  family_name VARCHAR(255) NOT NULL DEFAULT '',
  INDEX idx_author_family (family_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reference_authors (
  reference_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (reference_id, author_id),
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES authors(id) ON DELETE CASCADE,
  INDEX idx_ra_ref (reference_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id CHAR(36) PRIMARY KEY,
  reference_id CHAR(36) NOT NULL,
  original_name VARCHAR(512) NOT NULL,
  storage_path VARCHAR(1024) NOT NULL,
  mime VARCHAR(128) NOT NULL DEFAULT 'application/pdf',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  page_count INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reference_id) REFERENCES ref_items(id) ON DELETE CASCADE,
  INDEX idx_att_ref (reference_id)
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
