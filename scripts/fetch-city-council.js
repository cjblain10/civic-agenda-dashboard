#!/usr/bin/env node
// City of Houston City Council — passthrough/stub.
// The City Secretary site returns 403 to automated requests.
// This script preserves existing data and marks staleness.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'houston_city_council.json');

async function run() {
  console.log('[City Council] Starting...');

  // Read existing data
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.warn('[City Council] No existing data file found. Creating stub.');
    existing = {
      source: 'Houston City Council',
      fetched_at: new Date().toISOString(),
      note: 'No data available — City Secretary site blocks automated access.',
      data_sources: {
        primary: 'https://www.houstontx.gov/citysec/agenda/agendaindex.html',
        secondary: 'https://houston.novusagenda.com/agendapublic/Meetings.aspx'
      },
      officials: [],
      meetings: []
    };
  }

  // Calculate staleness
  const originalFetch = existing.fetched_at ? new Date(existing.fetched_at) : new Date(0);
  const daysSinceFetch = Math.floor((Date.now() - originalFetch.getTime()) / (1000 * 60 * 60 * 24));

  // Mark as stale but preserve data
  existing.stale = daysSinceFetch > 1;
  existing.stale_days = daysSinceFetch;
  existing.last_refresh_attempt = new Date().toISOString();
  existing.note = `Data originally fetched ${originalFetch.toISOString().split('T')[0]}. City Secretary site (houstontx.gov) returns 403 to automated requests. Data is ${daysSinceFetch} day(s) old. Manual refresh needed when new PDFs are available.`;

  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
  console.log(`[City Council] Preserved existing data (${daysSinceFetch} days old, ${existing.meetings?.length || 0} meetings)`);
  return existing;
}

module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
