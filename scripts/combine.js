#!/usr/bin/env node
// Combines all source JSON files into the single all_agendas.json the frontend expects.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const SOURCES = [
  { key: 'harris_county', file: 'harris_county.json' },
  { key: 'hisd', file: 'hisd.json' },
  { key: 'houston_city_council', file: 'houston_city_council.json' },
  { key: 'metro', file: 'metro.json' }
];

function run() {
  console.log('[Combine] Merging source files...');

  const combined = {
    fetched_at: new Date().toISOString(),
    sources: {}
  };

  for (const { key, file } of SOURCES) {
    const filePath = path.join(DATA_DIR, file);
    try {
      combined.sources[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const meetings = combined.sources[key].meetings?.length || 0;
      const items = (combined.sources[key].meetings || []).reduce(
        (sum, m) => sum + (m.agenda_items?.length || 0), 0
      );
      console.log(`  ${key}: ${meetings} meetings, ${items} items`);
    } catch (e) {
      console.error(`  ${key}: MISSING — ${e.message}`);
      combined.sources[key] = {
        source: key,
        fetched_at: null,
        error: `Source file not found: ${file}`,
        meetings: []
      };
    }
  }

  const outPath = path.join(DATA_DIR, 'all_agendas.json');
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));

  const totalMeetings = Object.values(combined.sources).reduce(
    (sum, s) => sum + (s.meetings?.length || 0), 0
  );
  const totalItems = Object.values(combined.sources).reduce(
    (sum, s) => sum + (s.meetings || []).reduce((s2, m) => s2 + (m.agenda_items?.length || 0), 0), 0
  );

  console.log(`[Combine] Done — ${totalMeetings} total meetings, ${totalItems} total items`);
  return combined;
}

module.exports = run;
if (require.main === module) run();
