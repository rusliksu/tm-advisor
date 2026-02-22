#!/usr/bin/env node
// analyze_maotd.js — Обработка MAotD данных из Reddit
// Вход: data/reddit_maotd.json
// Выход: data/maotd_analysis.json

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAOTD_PATH = path.join(ROOT, 'data', 'reddit_maotd.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'maotd_analysis.json');

// ── Load data ──
console.log('Loading MAotD data...');
const posts = JSON.parse(fs.readFileSync(MAOTD_PATH, 'utf8'));
console.log(`Found ${posts.length} MAotD posts`);

// ── Known MA metadata ──
const MA_META = {
  // Milestones
  'Terraformer': { map: 'Tharsis', type: 'milestone', requirement: '35 TR' },
  'Terran': { map: 'Tharsis / M&A expansion', type: 'milestone', requirement: '5 Earth tags' },
  'Forester': { map: 'M&A expansion', type: 'milestone', requirement: '3 Greenery tiles' },
  'Manager': { map: 'M&A expansion', type: 'milestone', requirement: '4 Production types at 2+' },
  'Geologist': { map: 'M&A expansion', type: 'milestone', requirement: '5 non-Earth tags of same type' },
  'Polar Explorer': { map: 'Elysium / M&A expansion', type: 'milestone', requirement: '3 tiles on bottom 2 rows' },
  'Specialist': { map: 'Hellas / M&A expansion', type: 'milestone', requirement: '6 Production of any resource' },
  'Builder': { map: 'Tharsis', type: 'milestone', requirement: '8 Building tags' },
  // Awards
  'Thermalist': { map: 'Tharsis', type: 'award', description: 'Most heat resource cubes' },
  'Collector': { map: 'M&A expansion', type: 'award', description: 'Most resources on cards (excluding MC)' },
  'Electrician': { map: 'M&A expansion', type: 'award', description: 'Most Power tags' },
  'Suburbian': { map: 'M&A expansion', type: 'award', description: 'Most City tiles' },
  'Landscaper': { map: 'Elysium / M&A expansion', type: 'award', description: 'Most Greenery tiles' },
  'Contractor': { map: 'M&A expansion', type: 'award', description: 'Most Building tags' },
  'Celebrity': { map: 'Elysium', type: 'award', description: 'Most cards costing 20+ MC' },
  'Miner': { map: 'Tharsis', type: 'award', description: 'Most steel + titanium resources' },
};

// ── Extract name from title ──
function extractName(title) {
  let name = title
    .replace(/\[MAotD\]\s*/, '')
    .replace(/^(Award|Milestone):\s*/i, '')
    .replace(/\s*\|.*/, '')
    .trim();
  return name;
}

// ── Detect type from title ──
function detectType(title) {
  if (title.includes('Award:') || title.includes('Award ')) return 'award';
  if (title.includes('Milestone:') || title.includes('Milestone ')) return 'milestone';
  // Fallback: check known metadata
  const name = extractName(title);
  if (MA_META[name]) return MA_META[name].type;
  return 'unknown';
}

// ── Extract key insights from comments ──
function extractInsights(comments) {
  // Filter meaningful comments
  const meaningful = comments.filter(c =>
    c.depth === 0 &&
    c.body.length > 30 &&
    c.author !== 'AutoModerator' &&
    c.author !== 'benbever' // Skip OP context-setting comments (depth 0 from poster)
  );

  // Sort by score
  meaningful.sort((a, b) => b.score - a.score);

  // Extract top insights (1-2 sentences from each)
  const insights = [];
  const seenAuthors = new Set();

  for (const comment of meaningful) {
    if (seenAuthors.has(comment.author)) continue;
    seenAuthors.add(comment.author);

    let text = comment.body
      .replace(/&gt;.*$/gm, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 1-2 meaningful sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      let insight = sentences[0].trim();
      if (insight.length < 60 && sentences[1]) {
        insight += ' ' + sentences[1].trim();
      }
      if (insight.length > 150) {
        insight = insight.substring(0, 147) + '...';
      }
      insights.push(insight);
    } else if (text.length > 10) {
      insights.push(text.length > 150 ? text.substring(0, 147) + '...' : text);
    }

    if (insights.length >= 4) break;
  }

  // Also include benbever's OP analysis if present
  const benComment = comments.find(c => c.author === 'benbever' && c.depth === 0 && c.body.length > 50);
  if (benComment) {
    const benText = benComment.body.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    const benSentences = benText.match(/[^.!?]+[.!?]+/g);
    if (benSentences && benSentences.length > 0) {
      const benInsight = benSentences[0].trim();
      if (benInsight.length > 10 && !insights.includes(benInsight)) {
        insights.unshift('[benbever] ' + (benInsight.length > 150 ? benInsight.substring(0, 147) + '...' : benInsight));
      }
    }
  }

  return insights;
}

// ── Process posts ──
const result = {
  milestones: {},
  awards: {},
  meta: {
    totalPosts: posts.length,
    totalComments: posts.reduce((s, p) => s + p.comments.length, 0),
    generatedAt: new Date().toISOString(),
  },
};

for (const post of posts) {
  const name = extractName(post.title);
  const type = detectType(post.title);
  const meta = MA_META[name] || {};

  const entry = {
    name: name,
    map: meta.map || 'Unknown',
    insights: extractInsights(post.comments),
    reddit_url: post.permalink,
    commentCount: post.comments.length,
    postScore: post.score,
  };

  if (type === 'milestone') {
    entry.requirement = meta.requirement || 'Unknown';
    result.milestones[name] = entry;
  } else if (type === 'award') {
    entry.description = meta.description || 'Unknown';
    result.awards[name] = entry;
  } else {
    // Unknown type — try to classify by name
    if (meta.type === 'milestone') {
      entry.requirement = meta.requirement || 'Unknown';
      result.milestones[name] = entry;
    } else {
      entry.description = meta.description || 'Unknown';
      result.awards[name] = entry;
    }
  }
}

// ── Save ──
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf8');

console.log(`\nResults:`);
console.log(`  Milestones: ${Object.keys(result.milestones).length}`);
console.log(`  Awards: ${Object.keys(result.awards).length}`);
console.log(`  Total comments: ${result.meta.totalComments}`);
console.log(`Saved to ${OUTPUT_PATH}`);
