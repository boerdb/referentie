-- Volledige tekst van PDF's (doorzoekbaar) en meerdere bijlagen per artikel.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS full_text MEDIUMTEXT NULL;
-- Volgorde van de bijlagen; de eerste is de hoofd-PDF.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;
-- Korte omschrijving, bijv. "Supplement" of "Protocol".
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS label VARCHAR(255) NULL;
ALTER TABLE attachments ADD FULLTEXT INDEX IF NOT EXISTS ft_att_text (full_text);
