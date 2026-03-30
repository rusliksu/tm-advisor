"""
COTD Integration Batch 1: Cards 0-52 (53 cards)
Reads COTD comments, updates reasoning in evaluations.json
"""
import json
import sys
import os

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load data
with open('data/cotd_update_needed.json', 'r', encoding='utf-8') as f:
    needed = json.load(f)
with open('data/evaluations.json', 'r', encoding='utf-8') as f:
    evals = json.load(f)
with open('data/cotd_lookup.json', 'r', encoding='utf-8') as f:
    cotd = json.load(f)

# Build case-insensitive lookup for evals
evals_lower = {k.lower(): k for k in evals.keys()}

def find_eval_key(name):
    if name in evals:
        return name
    lower = name.lower()
    if lower in evals_lower:
        return evals_lower[lower]
    return None

def get_cotd_comments(card_name):
    """Get all COTD comments for a card, sorted by score."""
    if card_name not in cotd:
        return []
    all_comments = []
    for post in cotd[card_name]:
        for c in post.get('comments', []):
            # Skip Enson_Chan's posts (they're just the card description)
            if c.get('author') == 'Enson_Chan':
                continue
            all_comments.append(c)
    # Sort by score descending
    all_comments.sort(key=lambda x: x.get('score', 0), reverse=True)
    return all_comments

def summarize_cotd(comments, card_name, current_score, current_tier):
    """Create a summary of COTD insights for a card."""
    if not comments:
        return None, None

    # Get top comments (by score)
    top = comments[:15]  # Read up to 15 top comments

    # Collect key themes
    themes = []
    sentiment_positive = 0
    sentiment_negative = 0
    score_suggestions = []

    for c in top:
        body = c['body'].lower()
        score = c.get('score', 0)

        # Track sentiment
        strong_positive = any(w in body for w in ['amazing', 'incredible', 'must-pick', 'must pick', 'always buy', 'always take', 'best', 'broken', 'insane', 'top tier', 'op ', 'overpowered', 'auto-buy', 'auto buy', 'one of the best'])
        strong_negative = any(w in body for w in ['terrible', 'awful', 'never buy', 'never take', 'trap', 'worst', 'garbage', 'useless', 'skip', 'overpriced', 'waste', 'too expensive', 'not worth', 'bad card'])
        mild_positive = any(w in body for w in ['good', 'solid', 'decent', 'strong', 'nice', 'great', 'useful', 'underrated', 'love this'])
        mild_negative = any(w in body for w in ['mediocre', 'weak', 'situational', 'niche', 'overrated', 'meh', 'underwhelming', 'rarely', 'too slow'])

        if strong_positive:
            sentiment_positive += 2 * max(score, 1)
        elif mild_positive:
            sentiment_positive += max(score, 1)
        if strong_negative:
            sentiment_negative += 2 * max(score, 1)
        elif mild_negative:
            sentiment_negative += max(score, 1)

    # Determine if community thinks score should change
    total_sent = sentiment_positive + sentiment_negative
    if total_sent > 0:
        pos_ratio = sentiment_positive / total_sent
        if pos_ratio > 0.75 and current_score < 70:
            score_suggestions.append(('up', min(current_score + 8, 85)))
        elif pos_ratio > 0.85 and current_score < 80:
            score_suggestions.append(('up', min(current_score + 6, 90)))
        elif pos_ratio < 0.25 and current_score > 65:
            score_suggestions.append(('down', max(current_score - 8, 35)))
        elif pos_ratio < 0.35 and current_score > 70:
            score_suggestions.append(('down', max(current_score - 6, 40)))

    return top, score_suggestions

# Process cards
cards_to_process = needed['cards'][:53]
cards_updated = []
score_review_needed = []

for i, card_info in enumerate(cards_to_process):
    card_name = card_info['name']
    eval_key = find_eval_key(card_name)

    if eval_key is None:
        print(f"[SKIP] {i}: {card_name} - not found in evaluations")
        continue

    comments = get_cotd_comments(card_name)
    if not comments:
        print(f"[SKIP] {i}: {card_name} - no COTD comments")
        continue

    current = evals[eval_key]
    current_score = current['score']
    current_tier = current['tier']
    old_reasoning = current['reasoning']

    top_comments, score_suggestions = summarize_cotd(comments, card_name, current_score, current_tier)

    # Print card info for manual review during development
    print(f"\n{'='*60}")
    print(f"[{i}] {card_name} (score={current_score}, tier={current_tier})")
    print(f"  Comments: {len(comments)}")
    print(f"  Old reasoning: {old_reasoning[:150]}...")
    print(f"  Top 5 comments:")
    for c in (top_comments or [])[:5]:
        body_preview = c['body'][:120].replace('\n', ' ')
        print(f"    [{c['score']}] {body_preview}")
    if score_suggestions:
        print(f"  Score suggestion: {score_suggestions}")

print("\n\nDone listing. Now run the actual update script.")
