/**
 * add_event_tags.js — Add 'event' tag to event cards in card_tags.js
 * Event cards identified from TM source (CardType.EVENT)
 */
const fs = require('fs');
const path = require('path');

const TAGS_FILE = path.resolve(__dirname, '../extension/data/card_tags.js');
let src = fs.readFileSync(TAGS_FILE, 'utf8');

const eventCards = [
  'Aerobraked Ammonia Asteroid','Aerosport Tournament','Air Raid','Air-Scrapping Expedition',
  'Anti-trust Crackdown','Arborist Collective','Asteroid','Astra Mechanica',
  'Banned Delegate','Big Asteroid','Bribed Committee','Business Contacts',
  'Butterfly Effect','Canyon Survey','Charity Donation','Class-action Lawsuit',
  'Colonial Envoys','Comet','Comet for Venus','Communication Center',
  'Conscription','Controlled Bloom','Convoy From Europa','Coordinated Raid',
  'Corporate Blackmail','Cosmic Radiation','Crashlanding','Crash Site Cleanup',
  'Crater Survey','Darkside Meteor Bombardment','Data Leak','Declaration of Independence',
  'Deepnuking','Deep Space Operations','Deimos Down','Desperate Measures',
  'Diversity Support','Dust Storm','Economic Help','Envoys From Venus',
  'Expedition to the Surface - Venus','Export Convoy','Fabricated Scandal','Family Connections',
  'Floater Prototypes','Flooding','GHG Import From Venus','GHG Shipment',
  'Giant Ice Asteroid','Global Audit','Harvest','HE3 Production Quotas',
  'Head Start','Hired Raiders','Hostile Takeover','Hydrogen to Venus',
  'Ice Asteroid','Ice Cap Melting','Impactor Swarm','Imported GHG',
  'Imported Hydrogen','Imported Nitrogen','Imported Nutrients','Import of Advanced GHG',
  'Indentured Workers','Induced Tremor','Interplanetary Colony Ship','Interstellar Colony Ship',
  'Invention Contest','Investment Loan','Ishtar Expedition','Jovian Envoys',
  'Land Claim','Large Convoy','Last Resort Ingenuity','Law Suit',
  'Local Heat Trapping','Lunar Mine Urbanization','Luna Conference','Market Manipulation',
  'Martian Insurance Group','Martian Survey','Media Frenzy',
  'Mercenary Squad','Metallic Asteroid','Mineral Deposit','Mining Expedition',
  'Mooncrate Convoys To Mars','Narrative Spin','Nitrogen-Rich Asteroid','Odyssey',
  'Permafrost Extraction','Personal Agenda','Planetary Rights Buyout','Plant Tax',
  'Political Alliance','Preliminary Darkside','Price Wars','Private Investigator',
  'Project Inspection','Protected Growth','Public Celebrations','Public Plans',
  'Public Sponsored Grant','Reckless Detonation','Recruitment',
  'Red Appeasement','Red Tourism Wave','Release of Inert Gases',
  'Return to Abandoned Technology','Revolting Colonists','Road Piracy','Sabotage',
  'Scapegoat','Server Sabotage','Small Asteroid','Small Comet',
  'Social Events','Soil Enrichment','Soil Studies','Solar Logistics',
  'Solar Probe','Solar Storm','Space Debris Cleaning Operation','Special Design',
  'Special Permit','Spin-Inducing Asteroid','Spire','Staged Protests',
  'Sting Operation','Stratospheric Expedition','Subnautic Pirates','Subterranean Reservoir',
  'Syndicate Pirate Raids','Technology Demonstration','Thorium Rush','Towing A Comet',
  'Tunneling Loophole','Underground Detonators','Unexpected Application',
  'Virus','Volunteer Mining Initiative','Vote Of No Confidence','Water to Venus','We Grow As One'
];

let added = 0, notFound = 0;
eventCards.forEach(name => {
  const key = '"' + name + '": [';
  const idx = src.indexOf(key);
  if (idx >= 0) {
    const closeIdx = src.indexOf(']', idx + key.length);
    if (closeIdx >= 0) {
      const existing = src.substring(idx + key.length, closeIdx);
      if (!existing.includes('"event"')) {
        if (existing.trim().length > 0) {
          src = src.substring(0, closeIdx) + ',"event"' + src.substring(closeIdx);
        } else {
          src = src.substring(0, idx + key.length) + '"event"' + src.substring(closeIdx);
        }
        added++;
      }
    }
  } else {
    notFound++;
    // Card not in card_tags — add it
    const insertBefore = '\n};';
    const insertIdx = src.lastIndexOf(insertBefore);
    if (insertIdx >= 0) {
      src = src.substring(0, insertIdx) + '\n  "' + name + '": ["event"],' + src.substring(insertIdx);
      added++;
    }
  }
});

src = src.replace(/\/\/ (\d+) cards.*/, '// 792 cards (+ ' + added + ' event tags added)');
fs.writeFileSync(TAGS_FILE, src);
console.log('Added event tag to ' + added + ' cards (' + notFound + ' were not in card_tags, added as new)');
