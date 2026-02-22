"""
Scrape r/TerraformingMarsGame for COTD and MAotD posts with comments.
Uses Reddit JSON API (no auth required, rate-limited to ~30 req/min).

Usage:
  python scripts/scrape_reddit.py

Output:
  data/reddit_cotd.json   — all COTD posts by Enson_Chan
  data/reddit_maotd.json  — all MAotD posts by benbever
"""

import json
import os
import time
import urllib.request

BASE = "https://api.reddit.com"
HEADERS = {"User-Agent": "TM-Tierlist-Scraper/1.0"}
DELAY = 2  # seconds between requests (respect rate limit)

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(OUT_DIR, exist_ok=True)


def api_get(url):
    """GET request to Reddit JSON API."""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def search_posts(query, limit=100):
    """Search subreddit for posts matching query. Returns list of post dicts."""
    url = f"{BASE}/r/TerraformingMarsGame/search?q={query}&restrict_sr=on&sort=new&limit={limit}&type=link"
    data = api_get(url)
    posts = []
    for child in data.get("data", {}).get("children", []):
        d = child["data"]
        posts.append({
            "id": d["id"],
            "title": d["title"],
            "author": d["author"],
            "score": d["score"],
            "num_comments": d["num_comments"],
            "created_utc": d["created_utc"],
            "selftext": d["selftext"],
            "permalink": d["permalink"],
            "url": f"https://reddit.com{d['permalink']}",
        })
    return posts


def fetch_comments(post_id, limit=200):
    """Fetch all comments for a post. Returns list of comment dicts (flat)."""
    url = f"{BASE}/r/TerraformingMarsGame/comments/{post_id}.json?limit={limit}"
    data = api_get(url)
    if len(data) < 2:
        return []

    comments = []

    def parse_tree(children, depth=0):
        for c in children:
            if c["kind"] == "more":
                continue
            cd = c["data"]
            comments.append({
                "author": cd.get("author", "[deleted]"),
                "score": cd.get("score", 0),
                "body": cd.get("body", ""),
                "depth": depth,
            })
            replies = cd.get("replies")
            if replies and isinstance(replies, dict):
                parse_tree(replies["data"]["children"], depth + 1)

    parse_tree(data[1]["data"]["children"])
    return comments


def scrape_series(search_query, tag_filter, output_file):
    """Scrape a full series of posts + comments."""
    print(f"\n{'='*60}")
    print(f"Searching: {search_query}")
    print(f"{'='*60}")

    posts = search_posts(search_query)
    # Filter to matching tag
    posts = [p for p in posts if tag_filter in p["title"]]
    print(f"Found {len(posts)} posts with '{tag_filter}'")

    results = []
    for i, post in enumerate(posts):
        print(f"  [{i+1}/{len(posts)}] {post['title'][:60]}... ({post['num_comments']} comments)")
        time.sleep(DELAY)
        try:
            comments = fetch_comments(post["id"])
        except Exception as e:
            print(f"    ERROR fetching comments: {e}")
            comments = []

        results.append({
            **post,
            "comments": comments,
        })

        # Save intermediate results every 20 posts
        if (i + 1) % 20 == 0:
            out_path = os.path.join(OUT_DIR, output_file)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"    [saved {len(results)} posts to {output_file}]")

    # Final save
    out_path = os.path.join(OUT_DIR, output_file)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nSaved {len(results)} posts to {out_path}")
    return results


def main():
    # 1. COTD posts by Enson_Chan
    scrape_series(
        search_query="author%3AEnson_Chan+COTD",
        tag_filter="[COTD]",
        output_file="reddit_cotd.json",
    )

    time.sleep(3)

    # 2. MAotD posts by benbever
    scrape_series(
        search_query="author%3Abenbever+MAotD",
        tag_filter="[MAotD]",
        output_file="reddit_maotd.json",
    )

    print("\n" + "="*60)
    print("Done! Files saved to data/")
    print("="*60)


if __name__ == "__main__":
    main()
