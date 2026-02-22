#!/usr/bin/env node
// analyze_cotd.js — Обработка COTD данных из Reddit
// Вход: data/reddit_cotd.json + extension/data/ratings.json.js
// Выход: data/cotd_analysis.json + обновлённый ratings.json.js (поля c, r)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COTD_PATH = path.join(ROOT, 'data', 'reddit_cotd.json');
const RATINGS_PATH = path.join(ROOT, 'extension', 'data', 'ratings.json.js');
const ANALYSIS_PATH = path.join(ROOT, 'data', 'cotd_analysis.json');
const REPORT_PATH = path.join(ROOT, 'data', 'discrepancy_report.md');

// ── Author reputation weights ──
const AUTHOR_WEIGHT = {
  'icehawk84': 1.5,
  'benbever': 1.4,
  'SoupsBane': 1.3,
  'ThainEshKelch': 1.3,
  'FieldMouse007': 1.2,
  'CaptainCFloyd': 1.1,
  'baldsoprano': 1.1,
  'Great_GW': 1.1,
  'Blackgaze': 1.0,
};

// ── Sentiment patterns ──
const POSITIVE = /\b(great|strong|amazing|insane|must[\s-]?pick|excellent|powerhouse|top[\s-]?tier|S[\s-]?tier|A[\s-]?tier|godmode|broken|OP|love|fantastic|incredible|underrated|solid|premium|best|auto[\s-]?pick|staple|bomb|nuts)\b/i;
const NEGATIVE = /\b(bad|terrible|weak|awful|trap|skip|never|overrated|overprice[d]?|D[\s-]?tier|F[\s-]?tier|worst|garbage|mediocre|useless|avoid|hate|horrible|dreadful|junk|unplayable|waste)\b/i;
const MIXED = /\b(decent|fine|ok(?:ay)?|situational|niche|average|depends|conditional|underwhelm|mid|meh|passable|context|sometimes)\b/i;

// ── Load data ──
console.log('Loading COTD data...');
const cotdPosts = JSON.parse(fs.readFileSync(COTD_PATH, 'utf8'));

console.log('Loading ratings...');
const ratingsContent = fs.readFileSync(RATINGS_PATH, 'utf8');
const ratingsJson = ratingsContent.replace(/^const TM_RATINGS=/, '').replace(/;\s*$/, '');
const ratings = JSON.parse(ratingsJson);
const ratingNames = Object.keys(ratings);

// Build lowercase lookup for fuzzy matching
const nameLookup = {};
for (const name of ratingNames) {
  nameLookup[name.toLowerCase()] = name;
  // Also strip punctuation for matching
  nameLookup[name.toLowerCase().replace(/[.']/g, '')] = name;
}

// ── Filter card posts (exclude meta) ──
const META_PATTERNS = ['Announcement', 'Poll', 'Cycle', 'SHOTW', 'End of'];
const cardPosts = cotdPosts.filter(p => {
  if (!p.title.startsWith('[COTD]')) return false;
  return !META_PATTERNS.some(pat => p.title.includes(pat));
});

console.log(`Found ${cardPosts.length} card COTD posts out of ${cotdPosts.length} total`);

// ── Extract card name from title ──
function extractCardName(title) {
  return title.replace(/\[COTD\]\s*/, '').replace(/\s*\|.*/, '').trim();
}

// ── Manual name overrides for COTD posts with joke/variant titles ──
const MANUAL_MATCHES = {
  'Hi-tech Lab but a corp': 'Hi-Tech Lab',
  'Aridor on a Stick': 'Aridor',
};

// ── Match card name to ratings ──
function matchCardName(rawName) {
  // Manual overrides first
  if (MANUAL_MATCHES[rawName]) return MANUAL_MATCHES[rawName];

  // Direct match
  if (ratings[rawName]) return rawName;

  // Case-insensitive
  const lower = rawName.toLowerCase();
  if (nameLookup[lower]) return nameLookup[lower];

  // Without punctuation
  const noPunct = lower.replace(/[.']/g, '');
  if (nameLookup[noPunct]) return nameLookup[noPunct];

  // Try adding period (Morning Star Inc → Morning Star Inc.)
  if (nameLookup[lower + '.']) return nameLookup[lower + '.'];
  if (ratings[rawName + '.']) return rawName + '.';

  return null;
}

// ── Analyze sentiment of a comment ──
function analyzeSentiment(body) {
  const posMatches = (body.match(new RegExp(POSITIVE.source, 'gi')) || []).length;
  const negMatches = (body.match(new RegExp(NEGATIVE.source, 'gi')) || []).length;
  const mixMatches = (body.match(new RegExp(MIXED.source, 'gi')) || []).length;

  if (posMatches > negMatches + mixMatches) return 1;
  if (negMatches > posMatches + mixMatches) return -1;
  if (posMatches > 0 && negMatches > 0) return 0;
  if (mixMatches > 0) return 0;
  return 0; // neutral
}

// ── Extract efficiency mentions ──
const EFFICIENCY_RE = /(\d+(?:\.\d+)?)\s*mc\s*(?:\/|per)\s*(?:prod(?:uction)?|vp|tr)/gi;
function extractEfficiency(body) {
  const matches = [];
  let m;
  while ((m = EFFICIENCY_RE.exec(body)) !== null) {
    matches.push(m[0]);
  }
  EFFICIENCY_RE.lastIndex = 0;
  return matches;
}

// ── Extract card/corp name mentions from comment ──
function extractMentions(body, currentCard) {
  const mentions = [];
  for (const name of ratingNames) {
    if (name === currentCard) continue;
    if (name.length < 4) continue; // Skip very short names to avoid false positives
    if (body.includes(name)) {
      mentions.push(name);
    }
  }
  return mentions;
}

// ── Generate insight string (max 120 chars) ──
function generateInsight(comment) {
  let text = comment.body
    .replace(/&gt;.*$/gm, '')  // Remove quote blocks
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Take first 1-2 sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (sentences) {
    let insight = sentences[0].trim();
    if (insight.length < 60 && sentences[1]) {
      insight += ' ' + sentences[1].trim();
    }
    text = insight;
  }

  // Truncate to 120 chars
  if (text.length > 120) {
    text = text.substring(0, 117) + '...';
  }

  return text + ' — ' + comment.author;
}

// ── Sentiment score → approximate tier mapping ──
function sentimentToTier(score) {
  if (score > 0.6) return { tier: 'S/A', scoreRange: [85, 100] };
  if (score > 0.3) return { tier: 'A/B', scoreRange: [75, 84] };
  if (score > 0.0) return { tier: 'B/C', scoreRange: [65, 74] };
  if (score > -0.3) return { tier: 'C/D', scoreRange: [50, 64] };
  return { tier: 'D/F', scoreRange: [0, 49] };
}

// ── Process all card posts ──
const analysis = {};
let matched = 0;
let unmatched = [];

for (const post of cardPosts) {
  const rawName = extractCardName(post.title);
  const cardName = matchCardName(rawName);

  if (!cardName) {
    unmatched.push(rawName);
    continue;
  }

  matched++;

  // Filter only top-level comments (depth 0) + meaningful replies
  const topComments = post.comments.filter(c =>
    c.depth === 0 && c.body.length > 20 && c.author !== 'Enson_Chan' && c.author !== 'AutoModerator'
  );

  // Calculate community sentiment
  let weightedSum = 0;
  let totalWeight = 0;

  for (const comment of topComments) {
    const sentiment = analyzeSentiment(comment.body);
    const authorWeight = AUTHOR_WEIGHT[comment.author] || 1.0;
    const commentScore = Math.max(comment.score, 1); // floor at 1
    const weight = commentScore * authorWeight;

    weightedSum += sentiment * weight;
    totalWeight += weight;
  }

  const communitySentiment = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const tierEstimate = sentimentToTier(communitySentiment);
  const midpoint = (tierEstimate.scoreRange[0] + tierEstimate.scoreRange[1]) / 2;

  // Find best insight comment (highest score from trusted author)
  const sortedComments = [...topComments].sort((a, b) => {
    const wA = (AUTHOR_WEIGHT[a.author] || 1.0) * a.score;
    const wB = (AUTHOR_WEIGHT[b.author] || 1.0) * b.score;
    return wB - wA;
  });

  // Top 3 comments from different authors
  const seenAuthors = new Set();
  const topInsights = [];
  for (const c of sortedComments) {
    if (seenAuthors.has(c.author)) continue;
    seenAuthors.add(c.author);
    topInsights.push({
      author: c.author,
      score: c.score,
      body: c.body.substring(0, 500),
      sentiment: analyzeSentiment(c.body),
      efficiency: extractEfficiency(c.body),
      mentions: extractMentions(c.body, cardName),
    });
    if (topInsights.length >= 3) break;
  }

  // Generate insight string for ratings
  let insightStr = '';
  if (sortedComments.length > 0) {
    insightStr = generateInsight(sortedComments[0]);
  }

  // Short permalink (without reddit.com)
  const permalink = post.permalink;

  // Our current rating
  const ourData = ratings[cardName];
  const ourScore = ourData ? ourData.s : null;
  const ourTier = ourData ? ourData.t : null;

  analysis[cardName] = {
    rawTitle: post.title,
    postId: post.id,
    permalink: permalink,
    commentCount: topComments.length,
    communitySentiment: Math.round(communitySentiment * 1000) / 1000,
    estimatedTier: tierEstimate.tier,
    estimatedScoreRange: tierEstimate.scoreRange,
    ourScore: ourScore,
    ourTier: ourTier,
    delta: ourScore !== null ? ourScore - midpoint : null,
    topInsights: topInsights,
    insightString: insightStr,
  };
}

console.log(`Matched: ${matched} cards`);
console.log(`Unmatched: ${unmatched.length} — ${unmatched.join(', ')}`);

// ── Save analysis ──
fs.writeFileSync(ANALYSIS_PATH, JSON.stringify(analysis, null, 2), 'utf8');
console.log(`Saved analysis to ${ANALYSIS_PATH}`);

// ── Update ratings.json.js ──
let updatedCount = 0;
for (const [cardName, data] of Object.entries(analysis)) {
  if (ratings[cardName]) {
    ratings[cardName].c = data.permalink;
    if (data.insightString) {
      ratings[cardName].r = data.insightString;
    }
    updatedCount++;
  }
}

const updatedRatings = 'const TM_RATINGS=' + JSON.stringify(ratings) + ';';
fs.writeFileSync(RATINGS_PATH, updatedRatings, 'utf8');
console.log(`Updated ${updatedCount} cards in ratings.json.js with COTD links and insights`);

// ── Generate discrepancy report ──
const overrated = []; // Our score > Reddit estimate
const underrated = []; // Our score < Reddit estimate
const aligned = [];

for (const [cardName, data] of Object.entries(analysis)) {
  if (data.ourScore === null || data.commentCount < 2) continue;

  const midpoint = (data.estimatedScoreRange[0] + data.estimatedScoreRange[1]) / 2;
  const delta = data.ourScore - midpoint;

  if (delta > 8) {
    overrated.push({ name: cardName, ...data, delta });
  } else if (delta < -8) {
    underrated.push({ name: cardName, ...data, delta });
  } else {
    aligned.push({ name: cardName, ...data, delta });
  }
}

overrated.sort((a, b) => b.delta - a.delta);
underrated.sort((a, b) => a.delta - b.delta);

let report = `# Расхождения: наши рейтинги vs Reddit-консенсус

> Автоматически сгенерировано из ${matched} COTD постов (${Object.values(analysis).reduce((s, d) => s + d.commentCount, 0)} комментариев)
> Reddit-консенсус — приблизительная оценка на основе сентимент-анализа комментариев
> Десктопные тир-листы — эталонный источник. Оценки COTD — вторичны.

## Возможные переоценки (наш score выше Reddit)

| Карта | Наш | Reddit | Δ | Ключевой комментарий |
|-------|-----|--------|---|---------------------|
`;

for (const item of overrated) {
  const midpoint = (item.estimatedScoreRange[0] + item.estimatedScoreRange[1]) / 2;
  const topComment = item.topInsights[0];
  const commentStr = topComment
    ? `"${topComment.body.substring(0, 80).replace(/\n/g, ' ')}..." — ${topComment.author}`
    : '—';
  report += `| ${item.name} | ${item.ourScore}/${item.ourTier} | ~${Math.round(midpoint)}/${item.estimatedTier} | ${item.delta > 0 ? '+' : ''}${Math.round(item.delta)} | ${commentStr} |\n`;
}

report += `
## Возможные недооценки (наш score ниже Reddit)

| Карта | Наш | Reddit | Δ | Ключевой комментарий |
|-------|-----|--------|---|---------------------|
`;

for (const item of underrated) {
  const midpoint = (item.estimatedScoreRange[0] + item.estimatedScoreRange[1]) / 2;
  const topComment = item.topInsights[0];
  const commentStr = topComment
    ? `"${topComment.body.substring(0, 80).replace(/\n/g, ' ')}..." — ${topComment.author}`
    : '—';
  report += `| ${item.name} | ${item.ourScore}/${item.ourTier} | ~${Math.round(midpoint)}/${item.estimatedTier} | ${item.delta > 0 ? '+' : ''}${Math.round(item.delta)} | ${commentStr} |\n`;
}

report += `
## Совпадения (|Δ| ≤ 8) — ${aligned.length} карт пропущено

Эти карты имеют близкие оценки и не требуют ревью.
`;

fs.writeFileSync(REPORT_PATH, report, 'utf8');
console.log(`Saved discrepancy report to ${REPORT_PATH}`);
console.log(`  Overrated: ${overrated.length}, Underrated: ${underrated.length}, Aligned: ${aligned.length}`);
