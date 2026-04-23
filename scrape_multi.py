"""
Multi-source trivia scraper for Conundrum.
Sources: OpenTDB + The Trivia API (the-trivia-api.com)

Both are free, open, no API key required.

Run all sources, all categories:
  python3 scrape_multi.py

Run a specific source:
  python3 scrape_multi.py --sources opentdb
  python3 scrape_multi.py --sources triviaapi

Run specific categories only (case-insensitive):
  python3 scrape_multi.py --categories "Food & Drink" Music
  python3 scrape_multi.py --sources triviaapi --categories History Geography

Loop forever on a category:
  python3 scrape_multi.py --categories "Food & Drink" --loop

Available categories (union of both sources):
  Animals, Food & Drink, General Knowledge, Geography, History,
  Literature, Movies, Music, Science & Nature, Sports, Television
"""

import requests
import random
import time
import html
import sys
import os
import argparse

SUPABASE_URL = "https://vuqbhzzkoljhaxdmhict.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY environment variable not set.")
    print("  Run: export SUPABASE_SERVICE_KEY='your-service-role-key'")
    sys.exit(1)

SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

SIMILARITY_THRESHOLD = 0.93
BATCH = 50

# ── Category maps ──────────────────────────────────────────────────────────────

# OpenTDB category ID → Supabase category name
OPENTDB_MAP = {
    9:  "General Knowledge",
    10: "Literature",
    11: "Movies",
    12: "Music",
    14: "Television",
    17: "Science & Nature",
    21: "Sports",
    22: "Geography",
    23: "History",
    27: "Animals",
}

# The Trivia API slug → Supabase category name
TRIVIA_API_MAP = {
    "general_knowledge":  "General Knowledge",
    "history":            "History",
    "geography":          "Geography",
    "music":              "Music",
    "film_and_tv":        "Movies",
    "science":            "Science & Nature",
    "sport_and_leisure":  "Sports",
    "arts_and_literature":"Literature",
    "food_and_drink":     "Food & Drink",
    "society_and_culture":"General Knowledge",
}

# ── Supabase helpers ───────────────────────────────────────────────────────────

def get_category_map():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/categories?select=id,name&is_active=eq.true",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=15,
    )
    return {row["name"].lower(): row["id"] for row in r.json()}

def safe_request(method, url, retries=3, **kwargs):
    kwargs.setdefault("timeout", 20)
    for attempt in range(retries):
        try:
            return requests.request(method, url, **kwargs)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            if attempt == retries - 1:
                return None
            time.sleep(3 * (attempt + 1))
    return None

def is_duplicate(prompt):
    r = safe_request(
        "POST",
        f"{SUPABASE_URL}/rest/v1/rpc/check_question_similarity",
        headers=SB_HEADERS,
        json={"p_prompt": prompt},
    )
    if not r or r.status_code not in (200, 201):
        return False
    results = r.json()
    if results and results[0]["similarity_score"] >= SIMILARITY_THRESHOLD:
        return True
    return False

def insert_question(q, sb_cat_id):
    r = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/questions",
        headers={**SB_HEADERS, "Prefer": "return=representation"},
        json={
            "prompt":         q["prompt"],
            "question_type":  "multiple_choice",
            "difficulty":     q["difficulty"],
            "explanation":    q.get("explanation"),
            "category_id":    sb_cat_id,
            "is_active":      True,
        }
    )
    if not r or r.status_code not in (200, 201):
        return None
    q_id = r.json()[0]["id"]

    opts = [
        {"question_id": q_id, "option_text": text, "sort_order": i}
        for i, (text, _) in enumerate(q["options"])
    ]
    r2 = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/question_options",
        headers={**SB_HEADERS, "Prefer": "return=representation"},
        json=opts
    )
    if not r2 or r2.status_code not in (200, 201):
        return None

    inserted_opts = r2.json()
    correct_opt_id = None
    for i, (text, is_correct) in enumerate(q["options"]):
        if is_correct:
            for opt in inserted_opts:
                if opt["sort_order"] == i:
                    correct_opt_id = opt["id"]
                    break
            break

    if not correct_opt_id:
        return None

    r3 = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/question_answers",
        headers=SB_HEADERS,
        json={"question_id": q_id, "correct_option_id": correct_opt_id}
    )
    return q_id if r3 and r3.status_code in (200, 201) else None

def process_batch(questions, sb_cat_id, label):
    inserted = skipped = failed = 0
    for q in questions:
        if is_duplicate(q["prompt"]):
            skipped += 1
            continue
        result = insert_question(q, sb_cat_id)
        if result:
            inserted += 1
        else:
            failed += 1
    print(f"    {label}: {inserted} inserted, {skipped} dupes, {failed} failed")
    return inserted, skipped

# ── Source 1: OpenTDB ──────────────────────────────────────────────────────────

def fetch_opentdb(category_id, difficulty):
    r = safe_request("GET", "https://opentdb.com/api.php", params={
        "amount": BATCH, "category": category_id,
        "type": "multiple", "difficulty": difficulty,
    })
    if not r:
        return []
    data = r.json()
    if data.get("response_code") != 0:
        return []

    out = []
    for item in data["results"]:
        prompt  = html.unescape(item["question"])
        correct = html.unescape(item["correct_answer"])
        wrong   = [html.unescape(w) for w in item["incorrect_answers"]]
        all_opts = [correct] + wrong
        random.shuffle(all_opts)
        out.append({
            "prompt":     prompt,
            "difficulty": item["difficulty"],
            "options":    [(t, t == correct) for t in all_opts],
        })
    return out

def run_opentdb(sb_cat, category_filter=None):
    print("\n" + "═"*60)
    print("SOURCE 1: OpenTDB (opentdb.com)")
    print("═"*60)
    grand_total = grand_skip = 0

    for opentdb_id, sb_name in OPENTDB_MAP.items():
        if category_filter and sb_name.lower() not in category_filter:
            continue

        sb_cat_id = sb_cat.get(sb_name.lower())
        if not sb_cat_id:
            print(f"  ⚠️  '{sb_name}' not in Supabase — skipping")
            continue

        print(f"\n  {sb_name}")
        cat_total = cat_skip = 0

        for difficulty in ["easy", "medium", "hard"]:
            print(f"    [{difficulty}]…", end=" ", flush=True)
            qs = fetch_opentdb(opentdb_id, difficulty)
            time.sleep(5.5)  # OpenTDB rate limit
            ins, skip = process_batch(qs, sb_cat_id, f"{len(qs)} fetched")
            cat_total += ins; cat_skip += skip
            grand_total += ins; grand_skip += skip

        print(f"  ✓ {cat_total} inserted, {cat_skip} dupes")

    print(f"\n  OpenTDB total: {grand_total} inserted, {grand_skip} dupes skipped")
    return grand_total, grand_skip

# ── Source 2: The Trivia API ───────────────────────────────────────────────────

TRIVIA_API_DIFF = {"easy": "easy", "medium": "medium", "hard": "hard"}

def fetch_trivia_api(category_slug, difficulty, limit=50):
    r = safe_request("GET", "https://the-trivia-api.com/v2/questions", params={
        "limit":       limit,
        "categories":  category_slug,
        "difficulties": difficulty,
        "types":       "text_choice",
    }, headers={"User-Agent": "Conundrum/1.0"})

    if not r or r.status_code != 200:
        return []

    out = []
    for item in r.json():
        prompt  = item["question"]["text"].strip()
        correct = item["correctAnswer"].strip()
        wrong   = [w.strip() for w in item["incorrectAnswers"]]

        # Skip if we don't have exactly 3 wrong answers
        if len(wrong) != 3:
            continue

        all_opts = [correct] + wrong
        random.shuffle(all_opts)
        out.append({
            "prompt":     prompt,
            "difficulty": difficulty,
            "options":    [(t, t == correct) for t in all_opts],
        })
    return out

def run_trivia_api(sb_cat, category_filter=None):
    print("\n" + "═"*60)
    print("SOURCE 2: The Trivia API (the-trivia-api.com)")
    print("═"*60)
    grand_total = grand_skip = 0

    for slug, sb_name in TRIVIA_API_MAP.items():
        if category_filter and sb_name.lower() not in category_filter:
            continue

        sb_cat_id = sb_cat.get(sb_name.lower())
        if not sb_cat_id:
            print(f"  ⚠️  '{sb_name}' not in Supabase — skipping '{slug}'")
            continue

        print(f"\n  {sb_name} ({slug})")
        cat_total = cat_skip = 0

        for difficulty in ["easy", "medium", "hard"]:
            print(f"    [{difficulty}]…", end=" ", flush=True)
            qs = fetch_trivia_api(slug, difficulty)
            time.sleep(1.5)  # polite delay
            ins, skip = process_batch(qs, sb_cat_id, f"{len(qs)} fetched")
            cat_total += ins; cat_skip += skip
            grand_total += ins; grand_skip += skip

        print(f"  ✓ {cat_total} inserted, {cat_skip} dupes")

    print(f"\n  Trivia API total: {grand_total} inserted, {grand_skip} dupes skipped")
    return grand_total, grand_skip

# ── Main ───────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Multi-source trivia scraper for Conundrum",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--sources", "-s",
        nargs="+",
        choices=["opentdb", "triviaapi"],
        metavar="SOURCE",
        help=(
            "Which sources to run: opentdb, triviaapi. "
            "If omitted, both sources are used. "
            "Example: --sources opentdb"
        ),
    )
    parser.add_argument(
        "--categories", "-c",
        nargs="+",
        metavar="CATEGORY",
        help=(
            "One or more category names to scrape (case-insensitive). "
            "If omitted, all categories for the chosen source(s) are scraped. "
            "Examples: --categories Music  |  --categories \"Food & Drink\" History"
        ),
    )
    parser.add_argument(
        "--loop", "-l",
        action="store_true",
        help="Keep looping through the selected sources/categories indefinitely until Ctrl+C.",
    )
    return parser.parse_args()


def build_category_filter(requested):
    """Return a lowercase set of requested category names, or None to run all."""
    if not requested:
        return None
    return {r.lower() for r in requested}


def run_once(sources, category_filter, sb_cat):
    total_inserted = total_skipped = 0

    if "opentdb" in sources:
        ins, skip = run_opentdb(sb_cat, category_filter)
        total_inserted += ins; total_skipped += skip

    if "triviaapi" in sources:
        ins, skip = run_trivia_api(sb_cat, category_filter)
        total_inserted += ins; total_skipped += skip

    return total_inserted, total_skipped


def main():
    args = parse_args()

    print("╔══════════════════════════════════════════════════════════╗")
    print("║           CONUNDRUM MULTI-SOURCE SCRAPER                 ║")
    print("║  Sources: OpenTDB + The Trivia API                       ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

    print("Fetching Supabase categories…")
    sb_cat = get_category_map()
    print(f"Found categories: {list(sb_cat.keys())}\n")

    sources = args.sources if args.sources else ["opentdb", "triviaapi"]
    category_filter = build_category_filter(args.categories)

    print(f"Sources: {', '.join(sources)}")
    if category_filter:
        print(f"Categories: {', '.join(sorted(category_filter))}")
    else:
        print("Categories: ALL")
    if args.loop:
        print("Loop mode ON — press Ctrl+C to stop.")
    print()

    grand_inserted = grand_skipped = 0
    pass_num = 1

    while True:
        if args.loop:
            print(f"\n{'╔'+'═'*58+'╗'}")
            print(f"║  PASS {pass_num:<52}║")
            print(f"{'╚'+'═'*58+'╝'}")

        ins, skip = run_once(sources, category_filter, sb_cat)
        grand_inserted += ins
        grand_skipped  += skip

        print("\n" + "═"*60)
        print(f"✅ Pass complete")
        print(f"   Inserted this pass : {ins}")
        print(f"   Dupes skipped      : {skip}")
        if args.loop:
            print(f"   Cumulative total   : {grand_inserted} inserted, {grand_skipped} dupes")
        print("═"*60)

        if not args.loop:
            break

        pass_num += 1
        print(f"\n  Restarting in 10s… (Ctrl+C to stop)")
        time.sleep(10)

    print(f"\n✅ ALL DONE. Total inserted: {grand_inserted} | Dupes skipped: {grand_skipped}")

if __name__ == "__main__":
    main()
