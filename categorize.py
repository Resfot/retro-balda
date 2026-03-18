"""
BALDA Dictionary Categorizer
Sends nouns to Claude API in batches to assign thematic categories.
Usage: python categorize.py YOUR_API_KEY
"""
import json
import time
import os
import sys
import urllib.request

if len(sys.argv) < 2:
    print("Usage: python categorize.py YOUR_API_KEY")
    sys.exit(1)

API_KEY = sys.argv[1]

# Load dictionary
with open('dictionary_categorized.json', 'r', encoding='utf-8') as f:
    full_dict = json.load(f)

nouns = [w for w, cat in full_dict.items() if cat == 'noun']
print(f"Total nouns to categorize: {len(nouns)}")

CATEGORIES = """Categories (use ONLY these labels):
- animal (животные, птицы, рыбы, насекомые, моллюски, ракообразные)
- food (еда, напитки, ягоды, фрукты, овощи, специи, блюда, крупы)
- tech (технологии, компьютеры, электроника, интернет, связь)
- sport (спорт, игры, физкультура, упражнения)
- nature (природа: растения, деревья, цветы, погода, ландшафт, минералы, космос)
- body (тело, органы, анатомия, медицина, болезни, лекарства)
- clothing (одежда, обувь, аксессуары, ткани, украшения)
- profession (профессии, должности, звания, титулы)
- music (музыка, инструменты, жанры, танцы)
- science (наука, химия, физика, математика, лингвистика, термины)
- home (дом, быт, мебель, посуда, бытовая техника)
- transport (транспорт, машины, корабли, авиация, ж/д)
- building (здания, сооружения, архитектура, строительство)
- weapon (оружие, военное дело, боеприпасы)
- tool (инструменты, приспособления, механизмы)
- art (искусство, литература, кино, театр, живопись)
- general (всё что не подходит ни в одну категорию выше)"""

BATCH_SIZE = 500
OUTPUT_FILE = 'noun_categories.json'

# Load progress if exists (script is resumable!)
if os.path.exists(OUTPUT_FILE):
    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        results = json.load(f)
    print(f"Resuming from checkpoint: {len(results)} words already done")
else:
    results = {}

remaining = [w for w in nouns if w not in results]
print(f"Remaining: {len(remaining)}")

if not remaining:
    print("All done!")
    sys.exit(0)

batches = [remaining[i:i+BATCH_SIZE] for i in range(0, len(remaining), BATCH_SIZE)]
print(f"Batches to process: {len(batches)}")
print("=" * 50)

errors = 0
for batch_idx, batch in enumerate(batches):
    print(f"\n[{batch_idx+1}/{len(batches)}] Processing {len(batch)} words...", end=" ", flush=True)

    words_str = ", ".join(batch)

    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 16000,
        "messages": [
            {
                "role": "user",
                "content": f"""Categorize each Russian word into exactly one category.

{CATEGORIES}

Words: {words_str}

Respond ONLY with a JSON object mapping each word to its category. No markdown, no backticks, no explanation. Example format: {{"кот":"animal","стол":"home","врач":"profession"}}"""
            }
        ]
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        text = ""
        for block in data.get('content', []):
            if block.get('type') == 'text':
                text += block['text']

        text = text.strip()
        if text.startswith('```'):
            text = text.split('\n', 1)[1] if '\n' in text else text[3:]
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip()

        batch_results = json.loads(text)
        results.update(batch_results)

        # Save checkpoint after every batch
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, separators=(',', ':'))

        done_pct = len(results) / len(nouns) * 100
        print(f"OK (+{len(batch_results)}) | Total: {len(results)}/{len(nouns)} ({done_pct:.1f}%)")
        errors = 0

        if batch_idx < len(batches) - 1:
            time.sleep(1)

    except Exception as e:
        errors += 1
        print(f"ERROR: {e}")
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, separators=(',', ':'))
        
        if errors >= 3:
            print("\n3 consecutive errors. Stopping. Re-run to resume.")
            sys.exit(1)
        
        wait = min(30, 5 * errors)
        print(f"  Retrying in {wait}s...")
        time.sleep(wait)

# Final stats
print("\n" + "=" * 50)
print(f"DONE! Categorized {len(results)}/{len(nouns)} nouns")

from collections import Counter
counts = Counter(results.values())
print("\nCategory distribution:")
for cat, cnt in sorted(counts.items(), key=lambda x: -x[1]):
    print(f"  {cat}: {cnt}")

# Build final merged dictionary
print("\nBuilding final dictionary...")
final = {}
for w, cat in full_dict.items():
    if cat == 'noun' and w in results:
        final[w] = results[w]
    else:
        final[w] = cat

with open('dictionary_final.json', 'w', encoding='utf-8') as f:
    json.dump(final, f, ensure_ascii=False, separators=(',', ':'))

print(f"Saved dictionary_final.json ({len(final)} words)")
