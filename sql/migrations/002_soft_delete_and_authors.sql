-- Prullenbak: verwijderen zet deleted_at; definitief verwijderen gebeurt bij "Prullenbak legen".
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE ref_items ADD INDEX IF NOT EXISTS idx_ref_user_deleted (user_id, deleted_at);

-- Auteurs ontdubbelen. Tot nu toe kreeg elke opslag nieuwe auteursrijen.
UPDATE authors SET given_name = TRIM(given_name), family_name = TRIM(family_name);

-- Volgorde als sleutel, zodat twee auteurs met dezelfde naam bij één artikel kunnen.
ALTER TABLE reference_authors ADD INDEX IF NOT EXISTS idx_ra_author (author_id);
ALTER TABLE reference_authors DROP PRIMARY KEY, ADD PRIMARY KEY (reference_id, position);

-- Exacte naam (hoofdletter- en accentgevoelig) als sleutel.
ALTER TABLE authors ADD COLUMN IF NOT EXISTS name_key VARCHAR(511)
  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
  AS (CONCAT(given_name, '|', family_name)) STORED;

CREATE TEMPORARY TABLE author_canon AS
  SELECT name_key, MIN(id) AS canon_id FROM authors GROUP BY name_key;

UPDATE reference_authors ra
  JOIN authors a ON a.id = ra.author_id
  JOIN author_canon c ON c.name_key = a.name_key
  SET ra.author_id = c.canon_id
  WHERE ra.author_id <> c.canon_id;

DROP TEMPORARY TABLE author_canon;

DELETE a FROM authors a
  LEFT JOIN reference_authors ra ON ra.author_id = a.id
  WHERE ra.author_id IS NULL;

ALTER TABLE authors ADD UNIQUE INDEX IF NOT EXISTS uq_author_name (name_key);
