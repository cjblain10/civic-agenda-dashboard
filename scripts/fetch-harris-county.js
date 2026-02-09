#!/usr/bin/env node
// Fetches Harris County Commissioners Court agenda data from Legistar API.

const fs = require('fs');
const path = require('path');
const { tagHarrisCounty } = require('./geo-tagger');

const API_BASE = 'https://webapi.legistar.com/v1/harriscountytx';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function run() {
  console.log('[Harris County] Starting fetch...');

  const now = new Date();
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() - 90);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 60);

  const minStr = minDate.toISOString().split('T')[0];
  const maxStr = maxDate.toISOString().split('T')[0];

  // Fetch bodies
  const bodies = await fetchJSON(`${API_BASE}/bodies`);
  const activeBodies = bodies
    .filter(b => b.BodyActiveFlag === 1)
    .map(b => ({ id: b.BodyId, name: b.BodyName, type: b.BodyTypeName, members: b.BodyNumberOfMembers, active: true }));

  // Fetch officials
  const persons = await fetchJSON(`${API_BASE}/persons`);
  const officials = persons
    .filter(p => p.PersonActiveFlag === 1)
    .map(p => ({ id: p.PersonId, name: p.PersonFullName, email: p.PersonEmail || '', active: true }));

  // Fetch events in date range
  const eventsUrl = `${API_BASE}/events?$filter=EventDate ge datetime'${minStr}' and EventDate le datetime'${maxStr}'&$orderby=EventDate desc`;
  const events = await fetchJSON(eventsUrl);
  console.log(`[Harris County] Found ${events.length} events`);

  const meetings = [];
  for (const evt of events) {
    const eventDate = new Date(evt.EventDate);
    const isUpcoming = eventDate >= now;

    // Fetch event items
    let items = [];
    try {
      items = await fetchJSON(`${API_BASE}/events/${evt.EventId}/eventitems`);
    } catch (e) {
      console.warn(`[Harris County] Could not fetch items for event ${evt.EventId}: ${e.message}`);
    }

    const agendaItems = [];
    const typeBreakdown = {};

    for (const item of items) {
      const type = item.EventItemMatterType || 'Other';
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;

      // Fetch attachments
      let attachments = [];
      if (item.EventItemMatterId) {
        try {
          const atts = await fetchJSON(`${API_BASE}/matters/${item.EventItemMatterId}/attachments`);
          attachments = atts.map(a => ({
            name: a.MatterAttachmentName,
            url: a.MatterAttachmentHyperlink,
            binary_url: a.MatterAttachmentBinaryUrl || null
          }));
        } catch (e) {
          // Attachments may not exist for all items
        }
      }

      const geoTags = tagHarrisCounty(item.EventItemTitle);

      agendaItems.push({
        id: item.EventItemId,
        agenda_number: item.EventItemAgendaNumber || null,
        title: item.EventItemTitle || '',
        type,
        matter_file: item.EventItemMatterFile || null,
        matter_status: item.EventItemMatterStatus || null,
        consent: (item.EventItemAgendaSequence || 0) > 900 || /consent/i.test(item.EventItemTitle),
        geographic_tags: geoTags,
        attachments
      });
    }

    meetings.push({
      id: evt.EventId,
      date: eventDate.toISOString().split('T')[0],
      time: evt.EventTime || '',
      body: evt.EventBodyName || '',
      location: evt.EventLocation || '',
      comment: evt.EventComment || '',
      agenda_pdf: evt.EventAgendaFile || null,
      legistar_url: evt.EventInSiteURL || null,
      is_upcoming: isUpcoming,
      total_items: agendaItems.length,
      total_raw_items: items.length,
      consent_items: agendaItems.filter(i => i.consent).length,
      type_breakdown: typeBreakdown,
      geo_tagged_items: agendaItems.filter(i =>
        i.geographic_tags.precincts.length > 0 ||
        i.geographic_tags.addresses.length > 0 ||
        i.geographic_tags.flood_control
      ).length,
      agenda_items: agendaItems
    });
  }

  const result = {
    source: 'Harris County Commissioners Court',
    fetched_at: now.toISOString(),
    api_base: API_BASE + '/',
    bodies: activeBodies,
    officials,
    meetings,
    summary: {
      total_meetings: meetings.length,
      upcoming_meetings: meetings.filter(m => m.is_upcoming).length,
      past_meetings: meetings.filter(m => !m.is_upcoming).length,
      total_agenda_items: meetings.reduce((sum, m) => sum + m.total_items, 0)
    }
  };

  fs.writeFileSync(path.join(DATA_DIR, 'harris_county.json'), JSON.stringify(result, null, 2));
  console.log(`[Harris County] Done — ${meetings.length} meetings, ${result.summary.total_agenda_items} items`);
  return result;
}

module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
