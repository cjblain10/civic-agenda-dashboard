#!/usr/bin/env node
// Fetches Houston ISD Board of Education agenda data from Legistar API.

const fs = require('fs');
const path = require('path');
const { tagHISD } = require('./geo-tagger');

const API_BASE = 'https://webapi.legistar.com/v1/houstonisd';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function run() {
  console.log('[HISD] Starting fetch...');

  const now = new Date();
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() - 90);
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 60);

  const minStr = minDate.toISOString().split('T')[0];
  const maxStr = maxDate.toISOString().split('T')[0];

  // Fetch bodies
  const bodies = await fetchJSON(`${API_BASE}/bodies`);
  const mappedBodies = bodies.map(b => ({
    id: b.BodyId,
    name: b.BodyName,
    type: b.BodyTypeName,
    active: b.BodyActiveFlag === 1,
    meets: b.BodyMeetFlag === 1,
    members: b.BodyNumberOfMembers
  }));

  // Fetch officials
  const persons = await fetchJSON(`${API_BASE}/persons`);
  const officials = persons
    .filter(p => p.PersonActiveFlag === 1)
    .map(p => ({ id: p.PersonId, name: p.PersonFullName, email: p.PersonEmail || '', active: true }));

  // Fetch events in date range
  const eventsUrl = `${API_BASE}/events?$filter=EventDate ge datetime'${minStr}' and EventDate le datetime'${maxStr}'&$orderby=EventDate desc`;
  const events = await fetchJSON(eventsUrl);
  console.log(`[HISD] Found ${events.length} events`);

  const meetings = [];
  for (const evt of events) {
    const eventDate = new Date(evt.EventDate);

    // Fetch event items
    let items = [];
    try {
      items = await fetchJSON(`${API_BASE}/events/${evt.EventId}/eventitems`);
    } catch (e) {
      console.warn(`[HISD] Could not fetch items for event ${evt.EventId}: ${e.message}`);
    }

    const agendaItems = [];
    for (const item of items) {
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
          // Attachments may not exist
        }
      }

      const geoTags = tagHISD(item.EventItemTitle);

      agendaItems.push({
        id: item.EventItemId,
        sequence: item.EventItemAgendaSequence || 0,
        agenda_number: item.EventItemAgendaNumber || null,
        title: item.EventItemTitle || '',
        full_title: item.EventItemTitle || '',
        type: item.EventItemMatterType || 'Other',
        matter_file: item.EventItemMatterFile || null,
        matter_name: item.EventItemMatterName || null,
        consent: /consent/i.test(item.EventItemTitle || ''),
        action: item.EventItemActionName || null,
        passed: item.EventItemPassedFlag != null ? item.EventItemPassedFlag === 1 : null,
        mover: item.EventItemMoverName || null,
        seconder: item.EventItemSeconderName || null,
        agenda_note: item.EventItemAgendaNote || null,
        minutes_note: item.EventItemMinutesNote || null,
        geographic_tags: geoTags,
        attachments
      });
    }

    meetings.push({
      id: evt.EventId,
      date: eventDate.toISOString().split('T')[0],
      time: evt.EventTime || '',
      body: evt.EventBodyName || '',
      body_id: evt.EventBodyId,
      location: evt.EventLocation || '',
      type: evt.EventComment || 'Regular',
      agenda_status: evt.EventAgendaStatusName || null,
      agenda_url: evt.EventAgendaFile || null,
      detail_url: evt.EventInSiteURL || null,
      agenda_items: agendaItems,
      item_count: agendaItems.length
    });
  }

  const result = {
    source: 'Houston ISD',
    api_base: API_BASE + '/',
    fetched_at: now.toISOString(),
    summary: {
      total_meetings: meetings.length,
      upcoming_meetings: meetings.filter(m => new Date(m.date) >= now).length,
      past_meetings: meetings.filter(m => new Date(m.date) < now).length,
      total_agenda_items: meetings.reduce((sum, m) => sum + m.item_count, 0),
      active_bodies: mappedBodies.filter(b => b.active).length,
      active_officials: officials.length
    },
    bodies: mappedBodies,
    officials,
    meetings
  };

  fs.writeFileSync(path.join(DATA_DIR, 'hisd.json'), JSON.stringify(result, null, 2));
  console.log(`[HISD] Done — ${meetings.length} meetings, ${result.summary.total_agenda_items} items`);
  return result;
}

module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
