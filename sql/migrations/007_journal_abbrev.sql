-- Afgekorte tijdschriftnaam (bijv. "N Engl J Med") voor Vancouver, NEJM en AMA.
ALTER TABLE ref_items ADD COLUMN IF NOT EXISTS journal_abbrev VARCHAR(255) NULL AFTER journal;
