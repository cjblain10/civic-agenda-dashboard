#!/usr/bin/env node
// Orchestrator: runs all fetchers in sequence, then combines into all_agendas.json.

const fetchHarrisCounty = require('./fetch-harris-county');
const fetchHISD = require('./fetch-hisd');
const fetchMetro = require('./fetch-metro');
const fetchCityCouncil = require('./fetch-city-council');
const combine = require('./combine');

async function main() {
  const start = Date.now();
  console.log('=== Civic Agenda Data Refresh ===');
  console.log(`Started at ${new Date().toISOString()}\n`);

  const results = { success: [], failed: [] };

  const fetchers = [
    { name: 'Harris County', fn: fetchHarrisCounty },
    { name: 'HISD', fn: fetchHISD },
    { name: 'Metro', fn: fetchMetro },
    { name: 'City Council', fn: fetchCityCouncil }
  ];

  for (const { name, fn } of fetchers) {
    try {
      await fn();
      results.success.push(name);
    } catch (e) {
      console.error(`\n[ERROR] ${name} failed: ${e.message}\n`);
      results.failed.push({ name, error: e.message });
    }
  }

  // Always combine whatever we have
  console.log('\n--- Combining ---');
  combine();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== Refresh Complete (${elapsed}s) ===`);
  console.log(`Success: ${results.success.join(', ') || 'none'}`);
  if (results.failed.length > 0) {
    console.log(`Failed: ${results.failed.map(f => f.name).join(', ')}`);
    // Exit with error only if all fetchers failed
    if (results.success.length === 0) {
      process.exit(1);
    }
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
