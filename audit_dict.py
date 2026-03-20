"""
БАЛДА Dictionary Audit & Merge Script
- Applies category merges to dictionary_final.json
- Merges tiny categories into parent categories
- Merges 'other' and uncategorized 'noun' into 'general'
- Saves result to public/dictionary_categorized.json
"""
import json
import os
import sys
from collections import Counter
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Category merge map (source -> destination)
MERGES = {
    'agriculture': 'nature',
    'textile': 'clothing',
    'biology': 'science',
    'medical': 'body',
    'plant': 'nature',
    'toy': 'home',
    'sound': 'music',
    'material': 'tool',
    'education': 'science',
    'fuel': 'tech',
    'organization': 'general',
    'measure': 'science',
    'other': 'general',  # merge catch-all into general
    'noun': 'general',   # remaining uncategorized nouns
    'name': 'general',   # proper names aren't useful as game categories
}

# Known problem patterns - manual fixes
# Animals sometimes tagged as names or general
KNOWN_ANIMALS = {'кит', 'карп', 'линь', 'лев', 'орел', 'марал', 'норка', 'соболь',
                 'выдра', 'бобер', 'бобёр', 'хорь', 'хорек', 'хорёк', 'нутрия',
                 'дрозд', 'снегирь', 'зяблик', 'синица', 'ласка', 'кунья'}

KNOWN_FOOD = {'блин', 'щи', 'борщ', 'каша', 'квас', 'кисель', 'пирог', 'ватрушка',
              'пельмень', 'вареник', 'окрошка', 'уха', 'кулеш', 'кулебяка',
              'солянка', 'рассольник', 'ботвинья', 'тюря', 'толокно', 'краюха'}

KNOWN_SPORT = {'корт', 'ринг', 'мяч', 'клюшка', 'шайба', 'сетка', 'штанга',
               'гантель', 'боксер', 'форвард', 'бомбардир', 'вратарь', 'голкипер',
               'слалом', 'биатлон', 'триатлон', 'пентатлон', 'велотрек'}

KNOWN_BODY = {'палец', 'локоть', 'колено', 'запястье', 'голень', 'щиколотка',
              'висок', 'затылок', 'подбородок', 'ноздря', 'ресница', 'бровь'}

def main():
    # Load the better-categorized dictionary_final.json
    src_file = 'dictionary_final.json'
    if not os.path.exists(src_file):
        # Fall back to dictionary_categorized.json
        src_file = 'public/dictionary_categorized.json'
        print(f"dictionary_final.json not found, using {src_file}")

    with open(src_file, encoding='utf-8') as f:
        d = json.load(f)

    print(f"Loaded {len(d)} words from {src_file}")

    before_counts = Counter(d.values())
    print(f"\nBefore merges - category distribution:")
    for cat, cnt in sorted(before_counts.items(), key=lambda x: -x[1]):
        flag = " ← TINY (will merge)" if cnt < 30 and cat not in ('general', 'other', 'noun', 'name', 'verb', 'adjective') else ""
        print(f"  {cat}: {cnt}{flag}")

    # Apply known manual fixes first
    changes = []
    for word in list(d.keys()):
        orig = d[word]
        if word in KNOWN_ANIMALS and orig not in ('animal',):
            d[word] = 'animal'
            changes.append((word, orig, 'animal', 'known_animal'))
        elif word in KNOWN_FOOD and orig not in ('food',):
            d[word] = 'food'
            changes.append((word, orig, 'food', 'known_food'))
        elif word in KNOWN_SPORT and orig not in ('sport',):
            d[word] = 'sport'
            changes.append((word, orig, 'sport', 'known_sport'))
        elif word in KNOWN_BODY and orig not in ('body',):
            d[word] = 'body'
            changes.append((word, orig, 'body', 'known_body'))

    # Apply category merges
    for word in list(d.keys()):
        cat = d[word]
        if cat in MERGES:
            new_cat = MERGES[cat]
            changes.append((word, cat, new_cat, 'merge'))
            d[word] = new_cat

    after_counts = Counter(d.values())

    print(f"\n--- {len(changes)} total changes applied ---")
    merge_summary = Counter()
    for _, orig, new, reason in changes:
        merge_summary[f"{orig} → {new} ({reason})"] += 1
    for desc, cnt in sorted(merge_summary.items(), key=lambda x: -x[1]):
        print(f"  {desc}: {cnt} words")

    print(f"\nAfter merges - category distribution:")
    playable_cats = []
    for cat, cnt in sorted(after_counts.items(), key=lambda x: -x[1]):
        skip = {'general', 'other', 'verb', 'adjective', 'name', 'noun'}
        flag = ""
        if cnt < 30 and cat not in skip:
            flag = " ← STILL TOO SMALL"
        elif cnt >= 30 and cat not in skip:
            playable_cats.append(cat)
        print(f"  {cat}: {cnt}{flag}")

    print(f"\nPlayable categories (≥30 words, excluding generic): {len(playable_cats)}")
    print(f"  {', '.join(sorted(playable_cats))}")

    # Save updated dictionary
    out_file = 'public/dictionary_categorized.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))

    size_kb = os.path.getsize(out_file) / 1024
    print(f"\nSaved {len(d)} words to {out_file} ({size_kb:.1f} KB)")
    print("Done!")

if __name__ == '__main__':
    os.chdir('C:/Users/xboxm/TG_Balda')
    main()
