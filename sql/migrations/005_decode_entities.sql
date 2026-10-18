-- Crossref leverde soms HTML-entiteiten mee ("Critical Care &amp; Pain Medicine"); eenmalig omzetten.
UPDATE ref_items SET journal = REPLACE(journal, '&amp;', '&') WHERE journal LIKE '%&amp;%';
UPDATE ref_items SET title = REPLACE(REPLACE(REPLACE(title, '&amp;', '&'), '&lt;', '<'), '&gt;', '>') WHERE title LIKE '%&amp;%' OR title LIKE '%&lt;%' OR title LIKE '%&gt;%';
UPDATE ref_items SET abstract = REPLACE(abstract, '&amp;', '&') WHERE abstract LIKE '%&amp;%';
