-- Teruggetrokken artikelen (Crossref / Retraction Watch): soort melding, DOI en datum ervan.
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS retraction_type VARCHAR(32) NULL;
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS retraction_doi VARCHAR(255) NULL;
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS retraction_date DATE NULL;
-- Wanneer voor het laatst gecontroleerd; de wekelijkse controle kijkt naar de oudste eerst.
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS retraction_checked_at TIMESTAMP NULL;
