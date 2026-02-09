// Shared geographic tagging utilities for all data sources.

function tagHarrisCounty(title) {
  const text = (title || '').toLowerCase();
  const tags = { precincts: [], addresses: [], areas: [], flood_control: false };

  // Precinct references
  const precinctMatch = text.match(/precinct\s*(\d)/g);
  if (precinctMatch) {
    for (const m of precinctMatch) {
      const num = m.match(/\d/)[0];
      if (!tags.precincts.includes(num)) tags.precincts.push(num);
    }
  }

  // Flood control / drainage
  if (/flood|drainage|bayou|watershed|storm\s*water|levee/.test(text)) {
    tags.flood_control = true;
  }

  // Street addresses
  const addrMatch = (title || '').match(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Pkwy|Hwy|Loop|Fwy|Circle|Ct|Place|Pl)\b/g);
  if (addrMatch) {
    tags.addresses = [...new Set(addrMatch)];
  }

  // Named areas
  const areaPatterns = [
    /harris county/i, /memorial/i, /katy/i, /spring/i, /cypress/i,
    /tomball/i, /humble/i, /baytown/i, /pasadena/i, /clear lake/i,
    /pearland/i, /sugar land/i, /missouri city/i
  ];
  for (const p of areaPatterns) {
    const m = (title || '').match(p);
    if (m) tags.areas.push(m[0]);
  }

  return tags;
}

function tagHISD(title) {
  const text = (title || '');
  const tags = { trustee_districts: [], schools: [], addresses: [] };

  // Trustee districts (Roman numerals I-IX)
  const districtMatch = text.match(/district\s+(I{1,3}|IV|VI{0,3}|IX)/gi);
  if (districtMatch) {
    for (const m of districtMatch) {
      const roman = m.replace(/district\s+/i, '').toUpperCase();
      if (!tags.trustee_districts.includes(roman)) tags.trustee_districts.push(roman);
    }
  }

  // School names
  const schoolMatch = text.match(/\b[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)*\s+(?:Elementary|Middle|High)\s+School\b/g);
  if (schoolMatch) {
    tags.schools = [...new Set(schoolMatch)];
  }

  // Street addresses
  const addrMatch = text.match(/\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Pkwy)\b/g);
  if (addrMatch) {
    tags.addresses = [...new Set(addrMatch)];
  }

  return tags;
}

function tagMetro(title) {
  const text = (title || '');
  const tags = { routes: [], projects: [], locations: [] };

  // Route references
  const routeMatch = text.match(/route\s*\d+|line\s+\w+/gi);
  if (routeMatch) {
    tags.routes = [...new Set(routeMatch)];
  }

  // Location references
  const locPatterns = [
    /downtown/i, /uptown/i, /midtown/i, /galleria/i,
    /medical center/i, /nrg/i, /hobby/i, /iah/i,
    /northwest transit/i, /southeast/i, /northeast/i, /southwest/i,
    /park\s*(?:and|&)\s*ride/i, /transit center/i
  ];
  for (const p of locPatterns) {
    const m = text.match(p);
    if (m) tags.locations.push(m[0]);
  }

  return tags;
}

module.exports = { tagHarrisCounty, tagHISD, tagMetro };
