-- Groepen (handmatig en slim), trefwoorden en kleurlabels, zoals in Bookends.

-- Kleurlabel: 1 rood, 2 oranje, 3 geel, 4 groen, 5 blauw, 6 paars, 7 grijs; NULL = geen.
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS label TINYINT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE ref_items ADD INDEX IF NOT EXISTS idx_ref_user_label (user_id, label);

-- Handmatige groep: artikelen via group_items. Slimme groep: zoekregels in `rules` (JSON).
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
