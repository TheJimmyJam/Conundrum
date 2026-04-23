"""
OpenTDB scraper — pulls questions from opentdb.com and inserts into Supabase.
Skips any question that scores 85%+ similarity against existing vault questions.

Run all categories:
  python3 scrape_opentdb.py

Run specific categories (case-insensitive, partial match ok):
  python3 scrape_opentdb.py --categories "Food & Drink" Music History

Loop forever (restart after finishing):
  python3 scrape_opentdb.py --categories "Food & Drink" --loop

Available categories:
  General Knowledge, Literature, Movies, Music, Television,
  Science & Nature, Sports, Geography, History, Animals
"""

import requests
import random
import time
import html
import os
import sys
import argparse

SUPABASE_URL = "https://vuqbhzzkoljhaxdmhict.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY environment variable not set.")
    print("  Run: export SUPABASE_SERVICE_KEY='your-service-role-key'")
    sys.exit(1)

# OpenTDB category ID → Supabase category name (must match names in categories table)
CATEGORY_MAP = {
    9:  "General Knowledge",   # create this category in admin if you want it
    10: "Literature",          # Books
    11: "Movies",              # Film
    12: "Music",
    14: "Television",
    17: "Science & Nature",
    21: "Sports",
    22: "Geography",
    23: "History",
    27: "Animals",
    # Removed: cat 13 (Musicals — tiny pool, exhausted), cat 20 (Mythology — returns 0)
}

SIMILARITY_THRESHOLD = 0.93   # pg_trgm is structure-sensitive; 0.93 catches true dupes
                               # without blocking questions that share common sentence patterns
DELAY        = 5.5            # OpenTDB rate-limits hard — min 5s between requests
BATCH        = 50             # questions per API call (max 50)

SB_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

# ── Supabase ──────────────────────────────────────────────────────────────────

def get_category_map():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/categories?select=id,name&is_active=eq.true",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
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

def is_duplicate(prompt, debug=False):
    """Returns True if the prompt is too similar to an existing vault question."""
    r = safe_request(
        "POST",
        f"{SUPABASE_URL}/rest/v1/rpc/check_question_similarity",
        headers=SB_HEADERS,
        json={"p_prompt": prompt},
    )
    if not r or r.status_code not in (200, 201):
        return False  # if check fails, don't block insertion
    results = r.json()
    if results and results[0]["similarity_score"] >= SIMILARITY_THRESHOLD:
        if debug:
            score = round(results[0]["similarity_score"] * 100)
            matched = results[0]["matched_prompt"][:80]
            print(f"\n    [DUPE {score}%] '{prompt[:60]}' ~ '{matched}'")
        return True
    return False

def insert_question(q, sb_cat_id):
    # Step 1: Insert question row
    r = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/questions",
        headers={**SB_HEADERS, "Prefer": "return=representation"},
        json={
            "prompt": q["prompt"],
            "question_type": "multiple_choice",
            "difficulty": q["difficulty"],
            "explanation": None,
            "category_id": sb_cat_id,
            "is_active": True,
        }
    )
    if not r or r.status_code not in (200, 201):
        return None
    q_id = r.json()[0]["id"]

    # Step 2: Insert options
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

    # Step 3: Find correct option and insert into question_answers
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

# ── OpenTDB ───────────────────────────────────────────────────────────────────

def fetch_opentdb_batch(category_id, difficulty):
    """Fetch up to 50 questions for a category/difficulty from OpenTDB."""
    r = safe_request("GET", "https://opentdb.com/api.php", params={
        "amount": BATCH,
        "category": category_id,
        "type": "multiple",
        "difficulty": difficulty,
    })
    if not r:
        return []

    data = r.json()
    if data.get("response_code") != 0:
        return []

    questions = []
    for item in data["results"]:
        prompt  = html.unescape(item["question"])
        correct = html.unescape(item["correct_answer"])
        wrong   = [html.unescape(w) for w in item["incorrect_answers"]]

        all_opts = [correct] + wrong
        random.shuffle(all_opts)
        options = [(text, text == correct) for text in all_opts]

        questions.append({
            "prompt": prompt,
            "difficulty": item["difficulty"],
            "options": options,
        })
    return questions

# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="OpenTDB scraper for Conundrum",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--categories", "-c",
        nargs="+",
        metavar="CATEGORY",
        help=(
            "One or more category names to scrape (case-insensitive). "
            "If omitted, all categories are scraped. "
            "Examples: --categories Music  |  --categories \"Food & Drink\" History"
        ),
    )
    parser.add_argument(
        "--loop", "-l",
        action="store_true",
        help="Keep looping through the selected categories indefinitely until Ctrl+C.",
    )
    return parser.parse_args()


def filter_category_map(requested):
    """Return a subset of CATEGORY_MAP matching the requested names (case-insensitive)."""
    if not requested:
        return CATEGORY_MAP  # run everything

    requested_lower = [r.lower() for r in requested]
    filtered = {}
    for opentdb_id, sb_name in CATEGORY_MAP.items():
        if sb_name.lower() in requested_lower:
            filtered[opentdb_id] = sb_name

    missing = [r for r in requested if r.lower() not in [v.lower() for v in filtered.values()]]
    if missing:
        print(f"⚠️  Unrecognized categories (will be skipped): {missing}")
        available = sorted(set(CATEGORY_MAP.values()))
        print(f"   Available: {', '.join(available)}")

    return filtered


def run_once(active_map, sb_cat):
    grand_total = 0
    grand_skip  = 0

    for opentdb_id, sb_name in active_map.items():
        sb_cat_id = sb_cat.get(sb_name.lower())
        if not sb_cat_id:
            print(f"⚠️  '{sb_name}' not in Supabase — skipping OpenTDB cat {opentdb_id}")
            continue

        print(f"\n{'═'*60}")
        print(f"OpenTDB cat {opentdb_id} → {sb_name}")

        cat_total = 0
        cat_skip  = 0

        for difficulty in ["easy", "medium", "hard"]:
            print(f"  [{difficulty}]…", end=" ", flush=True)
            qs = fetch_opentdb_batch(opentdb_id, difficulty)
            time.sleep(DELAY)

            inserted = 0
            skipped  = 0
            for q in qs:
                if is_duplicate(q["prompt"], debug=False):
                    skipped += 1
                    continue
                if insert_question(q, sb_cat_id):
                    inserted += 1

            cat_total  += inserted
            cat_skip   += skipped
            grand_total += inserted
            grand_skip  += skipped
            print(f"{inserted}/{len(qs)} inserted, {skipped} dupes skipped "
                  f"(cat total: {cat_total}, grand: {grand_total})")

        print(f"  ✓ Done: {cat_total} inserted, {cat_skip} dupes skipped")

    print(f"\n{'═'*60}")
    print(f"✓ Pass complete. Inserted: {grand_total} | Dupes skipped: {grand_skip}")
    return grand_total, grand_skip


def main():
    args = parse_args()

    print("Fetching Supabase categories…")
    sb_cat = get_category_map()
    print(f"Found: {list(sb_cat.keys())}\n")

    active_map = filter_category_map(args.categories)
    if not active_map:
        print("No matching categories found. Exiting.")
        sys.exit(1)

    cat_names = list(active_map.values())
    print(f"Running categories: {', '.join(cat_names)}")
    if args.loop:
        print("Loop mode ON — press Ctrl+C to stop.\n")

    total_inserted = 0
    total_skipped  = 0
    pass_num = 1

    while True:
        if args.loop:
            print(f"\n{'╔'+'═'*58+'╗'}")
            print(f"║  PASS {pass_num:<52}║")
            print(f"{'╚'+'═'*58+'╝'}")

        ins, skip = run_once(active_map, sb_cat)
        total_inserted += ins
        total_skipped  += skip

        if not args.loop:
            break

        pass_num += 1
        print(f"\n  Cumulative: {total_inserted} inserted, {total_skipped} dupes | Restarting in 10s… (Ctrl+C to stop)")
        time.sleep(10)

    print(f"\n✓ ALL DONE. Total inserted: {total_inserted} | Total dupes skipped: {total_skipped}")

if __name__ == "__main__":
    main()
