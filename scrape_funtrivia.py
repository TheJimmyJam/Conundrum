"""
FunTrivia scraper — crawls subcategories and inserts questions into Supabase.
Respects the site with 1.2s delay between requests.

Run all categories:
  python3 scrape_funtrivia.py

Run specific categories (case-insensitive):
  python3 scrape_funtrivia.py --categories "Food & Drink" Music History

Loop forever (restart after finishing):
  python3 scrape_funtrivia.py --categories "Food & Drink" --loop

Available categories:
  Animals, Geography, History, Literature, Movies, Music,
  Science & Nature, Sports, Television

NOTE: Food & Drink is NOT available via FunTrivia (cat=26 doesn't map to food content).
For Food & Drink use: python3 scrape_multi.py --sources triviaapi --categories "Food & Drink"
"""

import requests
from bs4 import BeautifulSoup
import random
import time
import re
import os
import sys
import argparse

SUPABASE_URL = "https://vuqbhzzkoljhaxdmhict.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY environment variable not set.")
    print("  Run: export SUPABASE_SERVICE_KEY='your-service-role-key'")
    sys.exit(1)

# FunTrivia cat ID → Supabase category name (must match names in categories table)
# NOTE: Food & Drink is intentionally excluded here. FunTrivia's /questions/ endpoint
# (cat=26) does not map to actual food subcategories — it shows generic nav links.
# For Food & Drink, use: python3 scrape_multi.py --sources triviaapi --categories "Food & Drink"
MAIN_CATEGORIES = {
    "Animals":         1,
    "Geography":       15,
    "History":         14,
    "Literature":      19,
    "Movies":          7,
    "Music":           8,
    "Science & Nature": 9,
    "Sports":          10,
    "Television":      23,
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

MAX_SUBCATS_PER_CAT = 50   # subcategories to scrape per main category
SKIP_FIRST_N = {"Animals": 37}  # resume from subcategory 38 (0-indexed: skip 0-36)
DELAY = 1.2                 # seconds between requests

# ── Supabase ──────────────────────────────────────────────────────────────────

def get_category_map():
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/categories?select=id,name&is_active=eq.true",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    )
    return {row["name"].lower(): row["id"] for row in r.json()}

def safe_request(method, url, retries=3, **kwargs):
    """Wrapper that retries on timeout/connection errors."""
    kwargs.setdefault("timeout", 20)
    for attempt in range(retries):
        try:
            return requests.request(method, url, **kwargs)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            if attempt == retries - 1:
                print(f" [timeout, skipping]", end="")
                return None
            time.sleep(3 * (attempt + 1))
    return None

def insert_question(q, sb_headers):
    # Step 1: Insert question
    r = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/questions",
        headers={**sb_headers, "Prefer": "return=representation"},
        json={
            "prompt": q["prompt"],
            "question_type": "multiple_choice",
            "difficulty": q["difficulty"],
            "explanation": q.get("explanation"),
            "category_id": q.get("category_id"),
            "is_active": True,
        }
    )
    if not r or r.status_code not in (200, 201):
        return None
    q_id = r.json()[0]["id"]

    # Step 2: Insert options
    opts = [
        {"question_id": q_id, "option_text": text, "sort_order": i}
        for i, (text, _correct) in enumerate(q["options"])
    ]
    r2 = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/question_options",
        headers={**sb_headers, "Prefer": "return=representation"},
        json=opts
    )
    if not r2 or r2.status_code not in (200, 201):
        return None

    # Step 3: Find correct option_id and insert into question_answers
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
        headers=sb_headers,
        json={"question_id": q_id, "correct_option_id": correct_opt_id}
    )
    return q_id if r3 and r3.status_code in (200, 201) else None

# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_difficulty(text):
    t = text.lower()
    if "easy" in t: return "easy"
    if "hard" in t: return "hard"
    return "medium"

def find_container(tag):
    node = tag.parent
    for _ in range(12):
        if not node or node.name in ("body", "html", "[document]"):
            break
        if node.find("h4", class_="qntxt"):
            return node
        node = node.parent
    return None

def _extract_dids_from_soup(soup):
    """Pull all answers.cfm?did= links out of a parsed page."""
    dids = []
    seen = set()
    for a in soup.find_all("a", href=True):
        m = re.search(r"answers\.cfm\?did=(\d+)", a["href"])
        if m:
            did = int(m.group(1))
            if did not in seen:
                seen.add(did)
                dids.append((a.get_text().strip(), did))
    return dids


def _extract_subcats_from_soup(soup, exclude_ids):
    """Pull index.cfm?cat= subcategory links, excluding known top-level cat IDs."""
    subcats = []
    seen = set()
    for a in soup.find_all("a", href=True):
        m = re.search(r"index\.cfm\?cat=(\d+)", a["href"])
        if m:
            cat_id = int(m.group(1))
            if cat_id not in exclude_ids and cat_id not in seen:
                seen.add(cat_id)
                subcats.append((a.get_text().strip(), cat_id))
    return subcats


def get_subcategory_dids(main_cat_id, debug=False):
    """
    Fetch main category page and return list of (name, did) question-set tuples.

    FunTrivia now uses a two-level structure:
      Level 1: /questions/index.cfm?cat=MAIN  → subcategory links (index.cfm?cat=SUB)
      Level 2: /questions/index.cfm?cat=SUB   → question-set links (answers.cfm?did=N)

    We handle both old (did= directly on main page) and new (two-hop) layouts.
    """
    # Known top-level category IDs — used to filter nav links from real subcategory links
    top_level_ids = set(MAIN_CATEGORIES.values())

    base = "https://www.funtrivia.com/questions"
    url  = f"{base}/index.cfm?cat={main_cat_id}"

    if debug:
        print(f"  → Level 1: {url}")
    r = safe_request("GET", url, headers=HEADERS)
    if not r:
        print(f"  Error: no response from {url}")
        return []
    if r.status_code != 200:
        print(f"  Error: HTTP {r.status_code} from {url}")
        return []
    if debug:
        print(f"  HTTP 200 OK, {len(r.text)} chars")

    try:
        soup = BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        print(f"  Parse error: {e}")
        return []

    # --- Try old layout first: did= links directly on the category page ---
    dids = _extract_dids_from_soup(soup)
    if dids:
        if debug:
            print(f"  Found {len(dids)} did= links directly on main page (old layout).")
        return dids

    # --- New layout: subcategory pages → then did= links ---
    subcats = _extract_subcats_from_soup(soup, exclude_ids=top_level_ids | {main_cat_id})
    if debug:
        print(f"  No did= links on main page. Found {len(subcats)} subcategory pages to check.")

    if not subcats:
        if debug:
            cfm = [a["href"] for a in soup.find_all("a", href=True) if ".cfm" in a["href"]][:15]
            print(f"  Sample .cfm hrefs: {cfm}")
        return []

    all_dids = []
    seen_dids = set()
    for i, (sub_name, sub_id) in enumerate(subcats):
        sub_url = f"{base}/index.cfm?cat={sub_id}"
        if debug:
            print(f"  → Level 2 [{i+1}/{len(subcats)}]: {sub_name} (cat={sub_id})")
        time.sleep(DELAY)
        r2 = safe_request("GET", sub_url, headers=HEADERS)
        if not r2 or r2.status_code != 200:
            continue
        try:
            soup2 = BeautifulSoup(r2.text, "html.parser")
        except Exception:
            continue

        for name, did in _extract_dids_from_soup(soup2):
            if did not in seen_dids:
                seen_dids.add(did)
                all_dids.append((name, did))

    if debug:
        print(f"  Total did= links collected across all subcategory pages: {len(all_dids)}")

    return all_dids

def scrape_subcategory(did):
    """Scrape questions from a subcategory page."""
    url = f"https://www.funtrivia.com/questions/answers.cfm?did={did}"
    r = safe_request("GET", url, headers=HEADERS)
    if not r or r.status_code != 200:
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    questions = []
    seen_prompts = set()

    for green in soup.find_all("font", color="green"):
        try:
            correct = green.get_text().strip()
            if not correct or len(correct) > 200:
                continue

            container = find_container(green)
            if not container:
                continue

            h4 = container.find("h4", class_="qntxt")
            if not h4:
                continue

            q_text = re.sub(r"^\d+\.\s*", "", h4.get_text().strip())
            q_text = re.sub(r"^[A-Za-z /&]+:\s+", "", q_text)
            if not q_text or len(q_text) < 10 or q_text in seen_prompts:
                continue

            block_text = container.get_text(separator="\n")

            # Wrong answers
            inc = re.search(r"Some incorrect choices[:\s]*\n(.+?)(?:\n\n|\Z)", block_text, re.S)
            if not inc:
                continue
            wrong = [w.strip() for w in re.split(r",\s*", inc.group(1).strip()) if w.strip()]
            wrong = [w for w in wrong if w.lower() != correct.lower()][:3]
            if len(wrong) < 2:
                continue
            while len(wrong) < 3:
                wrong.append("None of the above")

            diff = re.search(r"Difficulty:\s*([\w ]+)\.", block_text)
            difficulty = parse_difficulty(diff.group(1)) if diff else "medium"

            exp = re.search(r"Interesting Information:\s*\n(.*?)(?=\nDifficulty|\n\nSome|\Z)", block_text, re.S)
            explanation = exp.group(1).strip().replace("\n", " ")[:400] if exp else None

            all_opts = [correct] + wrong[:3]
            random.shuffle(all_opts)
            options = [(text, text == correct) for text in all_opts]

            seen_prompts.add(q_text)
            questions.append({
                "prompt": q_text,
                "difficulty": difficulty,
                "explanation": explanation,
                "options": options,
            })
        except Exception:
            continue

    return questions

# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="FunTrivia scraper for Conundrum",
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
    parser.add_argument(
        "--debug", "-d",
        action="store_true",
        help="Print debug info: URLs fetched, HTTP status, sample links found on page.",
    )
    return parser.parse_args()


def filter_categories(requested):
    """Return a subset of MAIN_CATEGORIES matching the requested names (case-insensitive)."""
    if not requested:
        return MAIN_CATEGORIES

    requested_lower = [r.lower() for r in requested]
    filtered = {k: v for k, v in MAIN_CATEGORIES.items() if k.lower() in requested_lower}

    missing = [r for r in requested if r.lower() not in [k.lower() for k in filtered]]
    if missing:
        print(f"⚠️  Unrecognized categories (will be skipped): {missing}")
        available = sorted(MAIN_CATEGORIES.keys())
        print(f"   Available: {', '.join(available)}")

    return filtered


def run_once(active_cats, cat_map, sb_headers, debug=False):
    grand_total = 0

    for cat_name, ft_cat_id in active_cats.items():
        sb_cat_id = cat_map.get(cat_name.lower())
        print(f"\n{'═'*60}")
        print(f"CATEGORY: {cat_name}  (SB id={sb_cat_id})")

        print(f"  Fetching subcategory list…")
        subcats = get_subcategory_dids(ft_cat_id, debug=debug)
        skip = SKIP_FIRST_N.get(cat_name, 0)
        subcats_to_scrape = subcats[skip:skip + MAX_SUBCATS_PER_CAT]
        print(f"  Found {len(subcats)} subcategories. Scraping {len(subcats_to_scrape)} (skipping first {skip}).")
        time.sleep(DELAY)

        cat_total = 0
        for i, (subcat_name, did) in enumerate(subcats_to_scrape):
            print(f"  [{i+1}/{min(len(subcats), MAX_SUBCATS_PER_CAT)}] {subcat_name} (did={did})… ", end="", flush=True)
            qs = scrape_subcategory(did)
            if not qs:
                print("0 questions, skipping.")
                time.sleep(DELAY)
                continue

            inserted = 0
            for q in qs:
                q["category_id"] = sb_cat_id
                if insert_question(q, sb_headers):
                    inserted += 1

            cat_total += inserted
            grand_total += inserted
            print(f"{inserted}/{len(qs)} inserted (cat total: {cat_total}, grand: {grand_total})")
            time.sleep(DELAY)

        print(f"  ✓ {cat_name} done: {cat_total} questions inserted.")

    print(f"\n{'═'*60}")
    print(f"✓ Pass complete. Total inserted: {grand_total}")
    return grand_total


def main():
    args = parse_args()

    sb_headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }

    print("Fetching Supabase categories…")
    cat_map = get_category_map()
    print(f"Found: {list(cat_map.keys())}\n")

    active_cats = filter_categories(args.categories)
    if not active_cats:
        print("No matching categories found. Exiting.")
        sys.exit(1)

    print(f"Running categories: {', '.join(active_cats.keys())}")
    if args.loop:
        print("Loop mode ON — press Ctrl+C to stop.")
    if args.debug:
        print("Debug mode ON.\n")

    total_inserted = 0
    pass_num = 1

    while True:
        if args.loop:
            print(f"\n{'╔'+'═'*58+'╗'}")
            print(f"║  PASS {pass_num:<52}║")
            print(f"{'╚'+'═'*58+'╝'}")

        inserted = run_once(active_cats, cat_map, sb_headers, debug=args.debug)
        total_inserted += inserted

        if not args.loop:
            break

        pass_num += 1
        print(f"\n  Cumulative total: {total_inserted} inserted | Restarting in 10s… (Ctrl+C to stop)")
        time.sleep(10)

    print(f"\n✓ ALL DONE. Total inserted: {total_inserted}")

if __name__ == "__main__":
    main()
