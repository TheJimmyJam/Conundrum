#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════╗
║      CONUNDRUM ALL-IN-ONE TRIVIA SCRAPER                 ║
║  Sources: OpenTDB · The Trivia API · JService            ║
╚══════════════════════════════════════════════════════════╝

Interactive launcher (recommended):
  python3 scrape_all.py

CLI mode (same as before):
  python3 scrape_all.py --sources opentdb triviaapi jservice
  python3 scrape_all.py --sources jservice --categories History --loop
  python3 scrape_all.py --categories "Food & Drink" Music --loop

Requirements:
  pip3 install requests questionary rich
"""

import requests
import random
import time
import html
import sys
import os
import re
import argparse

# ── Env ────────────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://vuqbhzzkoljhaxdmhict.supabase.co"
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY environment variable not set.")
    print("  Run: export SUPABASE_SERVICE_KEY='your-service-role-key'")
    sys.exit(1)

SB_HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
}

SIMILARITY_THRESHOLD = 0.93
BATCH = 50

# ── Optional pretty deps ───────────────────────────────────────────────────────

try:
    from rich.console import Console
    from rich.panel   import Panel
    from rich.table   import Table
    from rich         import box
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    class _FallbackConsole:
        def print(self, *a, **kw): print(*a)
        def rule(self, t=""): print("─" * 60 + (f" {t} " if t else ""))
    console = _FallbackConsole()

try:
    import questionary
    HAS_Q = True
except ImportError:
    HAS_Q = False

# ── Category maps ──────────────────────────────────────────────────────────────

ALL_CATEGORIES = [
    "Animals", "Food & Drink", "General Knowledge", "Geography",
    "History", "Literature", "Movies", "Music",
    "Science & Nature", "Sports", "Television",
    "Texas & Dallas",
]

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

TRIVIA_API_MAP = {
    "general_knowledge":   "General Knowledge",
    "history":             "History",
    "geography":           "Geography",
    "music":               "Music",
    "film_and_tv":         "Movies",
    "science":             "Science & Nature",
    "sport_and_leisure":   "Sports",
    "arts_and_literature": "Literature",
    "food_and_drink":      "Food & Drink",
    "society_and_culture": "General Knowledge",
}

# JService category keyword → Conundrum category
# JService has thousands of Jeopardy categories; these keywords catch the main ones
# JService base URLs — .io is the original but frequently flaky; .xyz is a mirror
JSERVICE_BASES = [
    "https://jservice.io/api",
    "https://jservice.xyz/api",
]

def jservice_get(path, params=None):
    """Try each JService base URL in order, return first successful response."""
    for base in JSERVICE_BASES:
        r = safe_request("GET", f"{base}{path}", params=params)
        if r and r.status_code == 200:
            try:
                data = r.json()
                if data:  # non-empty
                    return data
            except Exception:
                pass
        if r:
            print(f"    [debug] {base}{path} → HTTP {r.status_code}", flush=True)
        else:
            print(f"    [debug] {base}{path} → no response (timeout/connection error)", flush=True)
    return None

JSERVICE_KEYWORD_MAP = [
    (["science", "physics", "chemistry", "biology", "astronomy", "space",
      "earth", "nature", "animal", "plant", "element", "periodic"],          "Science & Nature"),
    (["history", "war", "president", "revolution", "ancient", "medieval",
      "empire", "century", "world war", "civil war", "historical"],          "History"),
    (["geography", "country", "capital", "continent", "ocean", "river",
      "mountain", "city", "nation", "state", "flag", "map"],                 "Geography"),
    (["music", "song", "album", "band", "singer", "rapper", "jazz",
      "rock", "pop", "classical", "composer", "lyric", "hit"],               "Music"),
    (["movie", "film", "oscar", "actor", "actress", "director", "cinema",
      "hollywood", "animated", "blockbuster", "sequel"],                     "Movies"),
    (["television", "tv", "sitcom", "drama", "series", "show", "episode",
      "cable", "network", "reality", "cartoon"],                             "Television"),
    (["sport", "football", "baseball", "basketball", "soccer", "nfl",
      "nba", "mlb", "nhl", "olympic", "athlete", "championship",
      "super bowl", "world series", "tennis", "golf"],                       "Sports"),
    (["food", "drink", "cuisine", "chef", "recipe", "wine", "beer",
      "cocktail", "restaurant", "ingredient", "cooking", "bake",
      "vegetable", "fruit", "dish", "meal"],                                 "Food & Drink"),
    (["literature", "novel", "author", "book", "poem", "poet", "fiction",
      "character", "shakespeare", "pulitzer", "bestseller", "chapter"],      "Literature"),
    (["animal", "mammal", "bird", "fish", "reptile", "insect", "species",
      "wild", "zoo", "habitat", "predator", "creature"],                     "Animals"),
    (["texas", "dallas", "houston", "austin", "san antonio", "lone star",
      "cowboy", "alamo"],                                                     "Texas & Dallas"),
]

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
    return bool(results and results[0]["similarity_score"] >= SIMILARITY_THRESHOLD)

def insert_question(q, sb_cat_id):
    r = safe_request("POST",
        f"{SUPABASE_URL}/rest/v1/questions",
        headers={**SB_HEADERS, "Prefer": "return=representation"},
        json={
            "prompt":        q["prompt"],
            "question_type": "multiple_choice",
            "difficulty":    q.get("difficulty", "medium"),
            "explanation":   q.get("explanation"),
            "category_id":   sb_cat_id,
            "is_active":     True,
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
        json=opts,
    )
    if not r2 or r2.status_code not in (200, 201):
        return None

    inserted_opts = r2.json()
    correct_opt_id = None
    for i, (_, is_correct) in enumerate(q["options"]):
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
        json={"question_id": q_id, "correct_option_id": correct_opt_id},
    )
    return q_id if r3 and r3.status_code in (200, 201) else None

def process_batch(questions, sb_cat_id, label=""):
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
    if label:
        print(f"    {label}: +{inserted} new, {skipped} dupes, {failed} failed")
    return inserted, skipped

# ══════════════════════════════════════════════════════════
# SOURCE 1: OpenTDB
# ══════════════════════════════════════════════════════════

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
    _header("OpenTDB · opentdb.com")
    grand_total = grand_skip = 0
    for opentdb_id, sb_name in OPENTDB_MAP.items():
        if category_filter and sb_name.lower() not in category_filter:
            continue
        sb_cat_id = sb_cat.get(sb_name.lower())
        if not sb_cat_id:
            print(f"  ⚠  '{sb_name}' not in Supabase — skipping")
            continue
        print(f"\n  {sb_name}")
        cat_total = cat_skip = 0
        for difficulty in ["easy", "medium", "hard"]:
            print(f"    [{difficulty}]…", end=" ", flush=True)
            qs = fetch_opentdb(opentdb_id, difficulty)
            time.sleep(5.5)
            ins, skip = process_batch(qs, sb_cat_id, f"{len(qs)} fetched")
            cat_total += ins; cat_skip += skip
            grand_total += ins; grand_skip += skip
        print(f"  ✓ {cat_total} inserted, {cat_skip} dupes")
    _footer("OpenTDB", grand_total, grand_skip)
    return grand_total, grand_skip

# ══════════════════════════════════════════════════════════
# SOURCE 2: The Trivia API
# ══════════════════════════════════════════════════════════

def fetch_trivia_api(category_slug, difficulty, limit=50):
    r = safe_request("GET", "https://the-trivia-api.com/v2/questions", params={
        "limit": limit, "categories": category_slug,
        "difficulties": difficulty, "types": "text_choice",
    }, headers={"User-Agent": "Conundrum/1.0"})
    if not r or r.status_code != 200:
        return []
    out = []
    for item in r.json():
        prompt  = item["question"]["text"].strip()
        correct = item["correctAnswer"].strip()
        wrong   = [w.strip() for w in item["incorrectAnswers"]]
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
    _header("The Trivia API · the-trivia-api.com")
    grand_total = grand_skip = 0
    for slug, sb_name in TRIVIA_API_MAP.items():
        if category_filter and sb_name.lower() not in category_filter:
            continue
        sb_cat_id = sb_cat.get(sb_name.lower())
        if not sb_cat_id:
            continue
        print(f"\n  {sb_name}")
        cat_total = cat_skip = 0
        for difficulty in ["easy", "medium", "hard"]:
            print(f"    [{difficulty}]…", end=" ", flush=True)
            qs = fetch_trivia_api(slug, difficulty)
            time.sleep(1.5)
            ins, skip = process_batch(qs, sb_cat_id, f"{len(qs)} fetched")
            cat_total += ins; cat_skip += skip
            grand_total += ins; grand_skip += skip
        print(f"  ✓ {cat_total} inserted, {cat_skip} dupes")
    _footer("The Trivia API", grand_total, grand_skip)
    return grand_total, grand_skip

# ══════════════════════════════════════════════════════════
# SOURCE 3: JService (Jeopardy!)
# ══════════════════════════════════════════════════════════

def clean_jservice_answer(raw):
    """Strip Jeopardy answer formatting: HTML tags, 'What is', parens, etc."""
    text = html.unescape(raw or "")
    text = re.sub(r"<[^>]+>", "", text)               # strip HTML tags
    text = re.sub(r"\(.*?\)", "", text)                # remove parenthetical hints
    text = re.sub(r"^(what|who|where|when|which)\s+(is|are|was|were)\s+", "",
                  text, flags=re.IGNORECASE)           # strip "What is/Who is"
    text = re.sub(r"^(the|a|an)\s+", "", text, flags=re.IGNORECASE)  # strip leading articles
    text = text.strip(' "\'.,\\/')
    return text if len(text) > 1 else None

def clean_jservice_clue(raw):
    """Clean up Jeopardy clue text for use as a question prompt."""
    text = html.unescape(raw or "")
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip()
    # Add question mark if missing
    if text and not text.endswith("?"):
        text = text + "."
    return text if len(text) > 10 else None

def map_jservice_category(jeopardy_cat_name):
    """Map a Jeopardy category name to a Conundrum category using keyword matching."""
    name_lower = jeopardy_cat_name.lower()
    for keywords, conundrum_cat in JSERVICE_KEYWORD_MAP:
        if any(kw in name_lower for kw in keywords):
            return conundrum_cat
    return "General Knowledge"  # default fallback

def fetch_jservice_clues_for_category(jeopardy_cat_id, count=100):
    """Fetch clues for a specific JService category ID."""
    data = jservice_get("/clues", params={"category": jeopardy_cat_id, "count": count})
    return data if isinstance(data, list) else []

def fetch_jservice_random(count=100):
    """Fetch random Jeopardy clues."""
    data = jservice_get("/random", params={"count": count})
    return data if isinstance(data, list) else []

def fetch_jservice_categories(count=100, offset=0):
    """Fetch a page of JService categories."""
    data = jservice_get("/categories", params={"count": count, "offset": offset})
    return data if isinstance(data, list) else []

def convert_jservice_clues(clues):
    """
    Convert a list of JService clue objects to Conundrum MC questions.

    Strategy for wrong answers: collect all answers from the same Jeopardy
    category, then pick 3 random ones that differ from the correct answer.
    """
    # Build answer pool per jeopardy category for distractors
    cat_answers = {}  # jeopardy_cat_id → [answer, ...]
    for clue in clues:
        cat_id = clue.get("category_id") or (clue.get("category") or {}).get("id")
        ans = clean_jservice_answer(clue.get("answer", ""))
        if cat_id and ans:
            cat_answers.setdefault(cat_id, []).append(ans)

    out = []
    for clue in clues:
        prompt_text = clean_jservice_clue(clue.get("question", ""))
        correct     = clean_jservice_answer(clue.get("answer", ""))

        if not prompt_text or not correct or len(correct) > 80:
            continue

        # Skip clues that are too vague or reference visual aids
        skip_phrases = ["seen here", "pictured", "this man", "this woman",
                        "audio daily double", "video clue", "_____"]
        if any(p in prompt_text.lower() for p in skip_phrases):
            continue

        # Get category name
        cat_obj     = clue.get("category") or {}
        jcat_name   = cat_obj.get("title", "")
        cat_id      = clue.get("category_id") or cat_obj.get("id")
        conundrum_cat = map_jservice_category(jcat_name)

        # Build distractor pool from same Jeopardy category
        pool = [a for a in cat_answers.get(cat_id, []) if a.lower() != correct.lower()]
        random.shuffle(pool)
        wrong = pool[:3]

        if len(wrong) < 3:
            continue  # not enough distractors in this category batch

        all_opts = [correct] + wrong
        random.shuffle(all_opts)

        # Estimate difficulty from dollar value
        value = clue.get("value") or 400
        if value <= 200:
            difficulty = "easy"
        elif value <= 800:
            difficulty = "medium"
        else:
            difficulty = "hard"

        out.append({
            "prompt":      prompt_text,
            "difficulty":  difficulty,
            "options":     [(t, t == correct) for t in all_opts],
            "_jcat":       conundrum_cat,  # resolved category
        })

    return out

def run_jservice(sb_cat, category_filter=None, clues_per_pass=500):
    """
    Scrape JService. Strategy:
    1. Find popular Jeopardy categories that map to desired Conundrum cats.
    2. Fetch clues from those categories in batches.
    3. Convert and insert.
    """
    _header("JService · jservice.io  (Jeopardy! archive)")
    grand_total = grand_skip = 0

    print("  Fetching Jeopardy category index…")

    # Collect enough categories to have good distractor pools
    jcat_pages = []
    for offset in range(0, 2000, 100):
        page = fetch_jservice_categories(count=100, offset=offset)
        if not page:
            break
        jcat_pages.extend(page)
        time.sleep(0.5)
        if len(jcat_pages) >= 500:
            break

    print(f"  Found {len(jcat_pages)} Jeopardy categories. Mapping to Conundrum…")

    # ── Fallback: if category index fails, use random clues directly ──
    if not jcat_pages:
        print("  ⚠  Category index empty — falling back to random clues mode…")
        all_random = []
        for _ in range(10):  # fetch 10 batches of 100 random clues
            batch = fetch_jservice_random(count=100)
            if batch:
                all_random.extend(batch)
            time.sleep(0.5)
        if not all_random:
            print("  ✗  JService unreachable on all mirrors. Skipping.")
            _footer("JService", 0, 0)
            return 0, 0
        print(f"  Got {len(all_random)} random clues via fallback.")
        converted = convert_jservice_clues(all_random)
        print(f"  {len(all_random)} clues → {len(converted)} convertible MC questions")
        for conundrum_cat, sb_cat_id_val in sb_cat.items():
            if category_filter and conundrum_cat not in category_filter:
                continue
            cat_qs = [q for q in converted if q["_jcat"].lower() == conundrum_cat]
            if not cat_qs:
                continue
            ins, skip = process_batch(cat_qs, sb_cat_id_val, f"{conundrum_cat}: {len(cat_qs)} converted")
            grand_total += ins; grand_skip += skip
        _footer("JService", grand_total, grand_skip)
        return grand_total, grand_skip

    # Group jeopardy categories by resolved Conundrum category
    jcat_by_conundrum = {}
    for jcat in jcat_pages:
        name = jcat.get("title", "")
        resolved = map_jservice_category(name)
        jcat_by_conundrum.setdefault(resolved, []).append(jcat)

    # Process each Conundrum category
    for conundrum_cat, jcats in sorted(jcat_by_conundrum.items()):
        if category_filter and conundrum_cat.lower() not in category_filter:
            continue

        sb_cat_id = sb_cat.get(conundrum_cat.lower())
        if not sb_cat_id:
            print(f"  ⚠  '{conundrum_cat}' not in Supabase — skipping")
            continue

        print(f"\n  {conundrum_cat}  ({len(jcats)} Jeopardy categories matched)")

        # Sample up to 15 Jeopardy categories per Conundrum category
        sampled_jcats = random.sample(jcats, min(15, len(jcats)))
        all_clues = []
        for jcat in sampled_jcats:
            clues = fetch_jservice_clues_for_category(jcat["id"], count=50)
            # Attach category info if missing
            for c in clues:
                if not c.get("category"):
                    c["category"] = jcat
                if not c.get("category_id"):
                    c["category_id"] = jcat["id"]
            all_clues.extend(clues)
            time.sleep(0.4)

        if not all_clues:
            print("    No clues returned — skipping")
            continue

        converted = convert_jservice_clues(all_clues)
        print(f"    {len(all_clues)} clues → {len(converted)} convertible MC questions")

        ins, skip = process_batch(converted, sb_cat_id,
                                  f"{len(converted)} converted")
        grand_total += ins; grand_skip += skip
        print(f"  ✓ {ins} inserted, {skip} dupes")

    _footer("JService", grand_total, grand_skip)
    return grand_total, grand_skip

# ══════════════════════════════════════════════════════════
# SOURCE 4: Local Jeopardy TSV  (combined_season1-41.tsv)
# ══════════════════════════════════════════════════════════

JEOPARDY_TSV = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "combined_season1-41.tsv")

def load_jeopardy_tsv(filepath=JEOPARDY_TSV):
    """
    Read the jwolle1 Jeopardy dataset TSV.
    Columns: round, clue_value, daily_double_value, category, comments,
             answer (clue text), question (correct answer), air_date, notes
    Returns list of raw row dicts.
    """
    if not os.path.exists(filepath):
        return None  # signal: file not found
    rows = []
    with open(filepath, encoding="utf-8") as f:
        headers = None
        for line in f:
            line = line.rstrip("\n")
            if headers is None:
                headers = line.split("\t")
                continue
            parts = line.split("\t")
            if len(parts) < len(headers):
                continue
            rows.append(dict(zip(headers, parts)))
    return rows

def clean_tsv_answer(raw):
    """Clean the 'question' column (already the bare answer, may have leading articles)."""
    text = (raw or "").strip()
    text = re.sub(r"^(the|a|an)\s+", "", text, flags=re.IGNORECASE)
    text = text.strip(' "\'.,\\/')
    return text if len(text) > 1 else None

def clean_tsv_clue(raw):
    """Clean the 'answer' column (the Jeopardy clue, used as our prompt)."""
    text = html.unescape((raw or "").strip())
    text = re.sub(r"<[^>]+>", "", text)
    text = text.strip()
    if text and not text.endswith(("?", ".")):
        text += "."
    return text if len(text) > 10 else None

def convert_tsv_rows(rows):
    """Convert TSV rows into Conundrum MC question dicts, grouped by Jeopardy category."""
    # Build answer pool per Jeopardy category for distractors
    cat_answers = {}
    for row in rows:
        cat  = row.get("category", "")
        ans  = clean_tsv_answer(row.get("question", ""))
        if cat and ans and len(ans) <= 80:
            cat_answers.setdefault(cat, []).append(ans)

    out = []
    skip_phrases = ["seen here", "pictured", "this man", "this woman",
                    "audio daily double", "video clue", "_____", "(", "href"]
    for row in rows:
        prompt_text = clean_tsv_clue(row.get("answer", ""))
        correct     = clean_tsv_answer(row.get("question", ""))

        if not prompt_text or not correct or len(correct) > 80:
            continue
        if any(p in prompt_text.lower() for p in skip_phrases):
            continue

        jcat = row.get("category", "")
        conundrum_cat = map_jservice_category(jcat)  # same keyword mapper

        # Distractors from same Jeopardy category
        pool = [a for a in cat_answers.get(jcat, []) if a.lower() != correct.lower()]
        random.shuffle(pool)
        wrong = pool[:3]
        if len(wrong) < 3:
            continue

        all_opts = [correct] + wrong
        random.shuffle(all_opts)

        try:
            value = int(row.get("clue_value") or 0) or int(row.get("daily_double_value") or 400)
        except ValueError:
            value = 400
        if value <= 200:
            difficulty = "easy"
        elif value <= 800:
            difficulty = "medium"
        else:
            difficulty = "hard"

        out.append({
            "prompt":     prompt_text,
            "difficulty": difficulty,
            "options":    [(t, t == correct) for t in all_opts],
            "_jcat":      conundrum_cat,
        })
    return out

def run_jeopardy_tsv(sb_cat, category_filter=None, chunk_size=5000):
    """
    Scrape from the local combined_season1-41.tsv Jeopardy dataset.
    Processes in random chunks so loop mode keeps finding new questions.
    """
    _header("Jeopardy! TSV  (combined_season1-41.tsv)")
    grand_total = grand_skip = 0

    rows = load_jeopardy_tsv()
    if rows is None:
        print(f"  ✗  File not found: {JEOPARDY_TSV}")
        print("     Download from: https://github.com/jwolle1/jeopardy_clue_dataset/releases")
        _footer("Jeopardy TSV", 0, 0)
        return 0, 0

    print(f"  Loaded {len(rows):,} clues from TSV.")

    # Shuffle and take a chunk (so repeated runs cover different questions)
    random.shuffle(rows)
    chunk = rows[:chunk_size]

    print(f"  Converting {len(chunk):,} clues to MC questions…")
    converted = convert_tsv_rows(chunk)
    print(f"  {len(converted):,} valid MC questions generated.\n")

    # Group by resolved Conundrum category
    by_cat = {}
    for q in converted:
        by_cat.setdefault(q["_jcat"], []).append(q)

    for conundrum_cat, qs in sorted(by_cat.items()):
        if category_filter and conundrum_cat.lower() not in category_filter:
            continue
        sb_cat_id = sb_cat.get(conundrum_cat.lower())
        if not sb_cat_id:
            print(f"  ⚠  '{conundrum_cat}' not in Supabase — skipping")
            continue
        print(f"  {conundrum_cat}  ({len(qs)} questions)")
        ins, skip = process_batch(qs, sb_cat_id, f"{len(qs)} converted")
        grand_total += ins
        grand_skip  += skip
        print(f"  ✓ {ins} inserted, {skip} dupes")

    _footer("Jeopardy TSV", grand_total, grand_skip)
    return grand_total, grand_skip

# ── Print helpers ──────────────────────────────────────────────────────────────

def _header(title):
    print(f"\n{'═'*60}")
    print(f"  {title}")
    print(f"{'═'*60}")

def _footer(source, total, skip):
    print(f"\n  {source} total: {total} inserted, {skip} dupes skipped")

# ══════════════════════════════════════════════════════════
# INTERACTIVE LAUNCHER
# ══════════════════════════════════════════════════════════

SOURCE_INFO = {
    "opentdb":   "OpenTDB        · opentdb.com              (~4k questions, 24 categories)",
    "triviaapi": "The Trivia API  · the-trivia-api.com       (large pool, good variety)",
    "jservice":  "JService       · jservice.io              (⚠ often down — use jeopardy instead)",
    "jeopardy":  "Jeopardy! TSV  · combined_season1-41.tsv  (538k local clues, no internet needed)",
}

def interactive_launcher():
    """Full interactive TUI using questionary if available, else numbered menus."""

    _banner()

    if HAS_Q:
        return _interactive_questionary()
    else:
        print("  Tip: pip3 install questionary  for a nicer interface\n")
        return _interactive_simple()

def _banner():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║       CONUNDRUM ALL-IN-ONE TRIVIA SCRAPER                ║")
    print("║  Sources: OpenTDB · The Trivia API · JService            ║")
    print("╚══════════════════════════════════════════════════════════╝\n")

def _interactive_questionary():
    import questionary
    from questionary import Choice

    # ── Sources ──
    source_choices = [
        Choice(title=SOURCE_INFO["opentdb"],   value="opentdb",   checked=True),
        Choice(title=SOURCE_INFO["triviaapi"], value="triviaapi", checked=True),
        Choice(title=SOURCE_INFO["jeopardy"],  value="jeopardy",  checked=True),
        Choice(title=SOURCE_INFO["jservice"],  value="jservice",  checked=False),
    ]
    sources = questionary.checkbox(
        "Which sources do you want to scrape?",
        choices=source_choices,
    ).ask()
    if not sources:
        print("Nothing selected. Exiting.")
        sys.exit(0)

    # ── Categories ──
    cat_choices = [Choice(title="ALL categories", value="__all__", checked=True)] + \
                  [Choice(title=c, value=c, checked=False) for c in ALL_CATEGORIES]

    selected_cats = questionary.checkbox(
        "Which categories? (select ALL or pick specific ones)",
        choices=cat_choices,
    ).ask()
    if not selected_cats:
        print("Nothing selected. Exiting.")
        sys.exit(0)

    if "__all__" in selected_cats:
        category_filter = None
    else:
        category_filter = {c.lower() for c in selected_cats}

    # ── Loop ──
    loop = questionary.confirm("Loop continuously until Ctrl+C?", default=False).ask()

    return sources, category_filter, loop

def _interactive_simple():
    """Fallback interactive menu without questionary."""

    # Sources
    print("Available sources:")
    source_keys = list(SOURCE_INFO.keys())
    for i, k in enumerate(source_keys, 1):
        print(f"  {i}. {SOURCE_INFO[k]}")
    n = len(source_keys)
    print(f"  {n+1}. ALL sources")
    raw = input(f"\nSelect sources (e.g. 1 3 or {n+1} for all): ").strip()
    if str(n+1) in raw.split() or raw == "":
        sources = source_keys
    else:
        sources = [source_keys[int(x)-1] for x in raw.split() if x.isdigit() and 1 <= int(x) <= n]
    if not sources:
        sources = source_keys
    print(f"  → {', '.join(sources)}\n")

    # Categories
    print("Available categories:")
    print("  0. ALL categories")
    for i, c in enumerate(ALL_CATEGORIES, 1):
        print(f"  {i:2}. {c}")
    raw = input("\nSelect categories (e.g. 1 5 9 or 0 for all): ").strip()
    if raw == "0" or raw == "":
        category_filter = None
    else:
        idxs = [int(x)-1 for x in raw.split() if x.isdigit() and 1 <= int(x) <= len(ALL_CATEGORIES)]
        category_filter = {ALL_CATEGORIES[i].lower() for i in idxs} if idxs else None
    if category_filter:
        print(f"  → {', '.join(sorted(category_filter))}\n")
    else:
        print("  → ALL categories\n")

    # Loop
    loop_raw = input("Loop continuously until Ctrl+C? (y/n) [n]: ").strip().lower()
    loop = loop_raw in ("y", "yes")

    return sources, category_filter, loop

# ══════════════════════════════════════════════════════════
# MAIN RUN LOGIC
# ══════════════════════════════════════════════════════════

RUNNERS = {
    "opentdb":   run_opentdb,
    "triviaapi": run_trivia_api,
    "jservice":  run_jservice,
    "jeopardy":  run_jeopardy_tsv,
}

def run_once(sources, category_filter, sb_cat):
    total_ins = total_skip = 0
    for source in sources:
        ins, skip = RUNNERS[source](sb_cat, category_filter)
        total_ins += ins; total_skip += skip
    return total_ins, total_skip

def print_summary(ins, skip, label="Pass"):
    print(f"\n{'═'*60}")
    print(f"  ✅ {label} complete")
    print(f"     Inserted  : {ins}")
    print(f"     Dupes skip: {skip}")
    print(f"{'═'*60}")

# ── CLI parser ─────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Conundrum all-in-one trivia scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--sources", "-s", nargs="+",
        choices=["opentdb", "triviaapi", "jservice", "jeopardy"],
        metavar="SOURCE",
        help="Sources to scrape: opentdb triviaapi jservice. Default: all.")
    parser.add_argument("--categories", "-c", nargs="+", metavar="CATEGORY",
        help='Category names (case-insensitive). E.g. --categories Music "Food & Drink"')
    parser.add_argument("--loop", "-l", action="store_true",
        help="Loop indefinitely. Press Ctrl+C to stop.")
    return parser.parse_args()

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    is_interactive = not args.sources and not args.categories

    if is_interactive:
        sources, category_filter, loop = interactive_launcher()
    else:
        _banner()
        sources = args.sources if args.sources else list(RUNNERS.keys())
        category_filter = {c.lower() for c in args.categories} if args.categories else None
        loop = args.loop

    # Print run config
    print(f"\n  Sources   : {', '.join(sources)}")
    if category_filter:
        print(f"  Categories: {', '.join(sorted(category_filter))}")
    else:
        print(f"  Categories: ALL")
    print(f"  Loop      : {'yes — Ctrl+C to stop' if loop else 'no (single pass)'}\n")

    print("  Fetching Supabase categories…")
    sb_cat = get_category_map()
    print(f"  Found: {', '.join(sb_cat.keys())}\n")

    grand_ins = grand_skip = 0
    pass_num = 1

    while True:
        if loop:
            print(f"\n{'╔'+'═'*58+'╗'}")
            print(f"║  PASS {pass_num:<52}║")
            print(f"{'╚'+'═'*58+'╝'}")

        try:
            ins, skip = run_once(sources, category_filter, sb_cat)
        except KeyboardInterrupt:
            break

        grand_ins  += ins
        grand_skip += skip
        print_summary(ins, skip, f"Pass {pass_num}" if loop else "Run")

        if not loop:
            break

        pass_num += 1
        print(f"\n  Restarting in 10s… (Ctrl+C to stop)")
        try:
            time.sleep(10)
        except KeyboardInterrupt:
            break

    if loop:
        print(f"\n  Grand total: {grand_ins} inserted · {grand_skip} dupes skipped")
    print("\n  Done.\n")

if __name__ == "__main__":
    main()
