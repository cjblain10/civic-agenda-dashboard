#!/usr/bin/env node
// Fetches Houston METRO agenda data from Granicus RSS feed.

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const { tagMetro } = require('./geo-tagger');

const RSS_URL = 'https://ridemetro.granicus.com/ViewPublisherRSS.php?view_id=5&mode=agendas';
const AGENDA_VIEWER = 'https://ridemetro.granicus.com/AgendaViewer.php?view_id=5&clip_id=';
const DATA_DIR = path.join(__dirname, '..', 'data');

const MEETING_SCHEDULE = {
  board_meetings: '4th Thursday of each month at 9:00 AM',
  committee_meetings: 'Week prior to board meeting, starting at 9:00 AM',
  committees: [
    'Audit & Human Resources',
    'Finance and Business Administration',
    'Infrastructure & Mobility Planning',
    'Customer Experience, Operations & Business Development',
    'Public Safety'
  ]
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.text();
}

function parseAgendaItems(html) {
  // Simple extraction from AgendaViewer HTML
  const items = [];
  // Match rows with agenda content — look for table cells with item text
  const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = rowPattern.exec(html)) !== null) {
    const cellText = match[1].replace(/<[^>]+>/g, '').trim();
    if (cellText && cellText.length > 10 && !/^\d+$/.test(cellText)) {
      items.push(cellText);
    }
  }
  return items;
}

// Generate projected meeting dates (4th Thursday pattern)
function getProjectedDates(count) {
  const dates = [];
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  for (let i = 0; i < count; i++) {
    // Find 4th Thursday of month
    const firstDay = new Date(year, month, 1);
    let thurCount = 0;
    let d = new Date(firstDay);
    while (thurCount < 4) {
      if (d.getDay() === 4) thurCount++;
      if (thurCount < 4) d.setDate(d.getDate() + 1);
    }
    dates.push({
      board: d.toISOString().split('T')[0],
      // Committee: week prior (subtract 7 days, use Wednesday)
      committee: new Date(d.getTime() - 7 * 86400000 + 86400000).toISOString().split('T')[0]
    });
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

async function run() {
  console.log('[Metro] Starting fetch...');

  const now = new Date();
  const xml = await fetchText(RSS_URL);
  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(xml);

  const channel = feed.rss?.channel || feed.channel || {};
  const rssItems = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
  console.log(`[Metro] RSS feed has ${rssItems.length} items`);

  const meetings = [];
  const seenDates = new Set();

  for (const rssItem of rssItems) {
    const title = rssItem.title || '';
    const link = rssItem.link || '';
    const pubDate = rssItem.pubDate ? new Date(rssItem.pubDate) : null;
    const description = rssItem.description || '';

    // Extract clip_id from link
    const clipMatch = link.match(/clip_id=(\d+)/);
    const clipId = clipMatch ? clipMatch[1] : null;

    // Parse meeting date from title or pubDate
    const dateMatch = title.match(/(\w+ \d+,?\s*\d{4})/);
    let meetingDate = pubDate ? pubDate.toISOString().split('T')[0] : '';
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!isNaN(parsed.getTime())) meetingDate = parsed.toISOString().split('T')[0];
    }

    // Determine meeting type
    let meetingType = 'Board Meeting';
    if (/committee/i.test(title)) meetingType = 'Committee Meeting';
    if (/special/i.test(title)) meetingType = 'Special Meeting';
    if (/workshop/i.test(title)) meetingType = 'Workshop';

    // Fetch agenda items if we have a clip_id and it's a recent meeting
    let agendaItems = [];
    if (clipId) {
      try {
        const html = await fetchText(AGENDA_VIEWER + clipId);
        const rawItems = parseAgendaItems(html);
        agendaItems = rawItems.map((text, idx) => ({
          item_number: idx + 1,
          title: text,
          geographic_tags: tagMetro(text)
        }));
      } catch (e) {
        console.warn(`[Metro] Could not fetch agenda for clip ${clipId}: ${e.message}`);
      }
    }

    const dateKey = meetingDate + meetingType;
    if (seenDates.has(dateKey)) continue;
    seenDates.add(dateKey);

    meetings.push({
      date: meetingDate,
      time: '9:00 AM',
      type: meetingType,
      status: new Date(meetingDate) >= now ? 'Upcoming' : 'Past',
      location: 'METRO Board Room, 1900 Main St, 2nd Floor, Houston, TX 77002',
      agenda_url: clipId ? AGENDA_VIEWER + clipId : null,
      agenda_items: agendaItems
    });
  }

  // Add projected future meetings if not already covered by RSS
  const projected = getProjectedDates(6);
  for (const p of projected) {
    if (new Date(p.board) > now) {
      const boardKey = p.board + 'Board Meeting';
      if (!seenDates.has(boardKey)) {
        meetings.push({
          date: p.board,
          time: '9:00 AM',
          type: 'Board Meeting (Projected)',
          status: 'Future - Projected Date',
          location: 'METRO Board Room, 1900 Main St, 2nd Floor, Houston, TX 77002',
          agenda_url: null,
          agenda_items: []
        });
      }
      const commKey = p.committee + 'Committee Meeting';
      if (!seenDates.has(commKey)) {
        meetings.push({
          date: p.committee,
          time: '9:00 AM',
          type: 'Committee Meetings (Projected)',
          status: 'Future - Projected Date',
          location: 'METRO Board Room, 1900 Main St, 2nd Floor, Houston, TX 77002',
          agenda_url: null,
          agenda_items: []
        });
      }
    }
  }

  // Sort by date descending
  meetings.sort((a, b) => b.date.localeCompare(a.date));

  const result = {
    source: 'Houston METRO',
    source_url: 'https://www.ridemetro.org/about/board-meetings',
    fetched_at: now.toISOString(),
    note: 'Data extracted from Granicus RSS feed and AgendaViewer. Future dates projected based on 4th-Thursday pattern.',
    data_sources: {
      rss_feed: RSS_URL,
      minutes_rss: 'https://ridemetro.granicus.com/ViewPublisherRSS.php?view_id=5&mode=minutes',
      video_rss: 'https://ridemetro.granicus.com/ViewPublisherRSS.php?view_id=5&mode=vpodcast',
      agenda_viewer_pattern: 'https://ridemetro.granicus.com/AgendaViewer.php?view_id=5&clip_id={clip_id}',
      document_viewer_pattern: 'https://ridemetro.granicus.com/MetaViewer.php?view_id=5&clip_id={clip_id}&meta_id={meta_id}'
    },
    meeting_schedule: MEETING_SCHEDULE,
    meetings
  };

  fs.writeFileSync(path.join(DATA_DIR, 'metro.json'), JSON.stringify(result, null, 2));
  console.log(`[Metro] Done — ${meetings.length} meetings`);
  return result;
}

module.exports = run;
if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });
