"""
Скрипт для очистки текстов в evaluations.json:
1. Убирает [CORRECTED: ...] метки
2. Убирает Reddit usernames
3. Чистит артефакты форматирования
"""

import json
import re
import sys

EVAL_PATH = "data/evaluations.json"

# All known Reddit usernames
KNOWN_USERNAMES = [
    'shai_aus', 'benbever', 'icehawk84', 'Krazyguy75', 'FieldMouse007',
    'ad_hocNC', 'CaptainCFloyd', 'warpspeed100', 'SoupsBane', 'Futuralis',
    'DragonlordAtarka', 'ThreadPools', 'ThreadPacifist', 'CatWeekly',
    'leggup', 'BurnerAccount', 'Enson_Chan', 'SonicN', 'Great_GW',
    'The-University', 'EspritFort', 'marekt14', 'Dokurushi', 'jaminfine',
    'the_propaganda_panda', 'Insanitarius', 'jussius', 'ThainEshKelch',
    'Mathematics1', 'Dry_Appointment_7210', 'dfinberg', 'SimonDinos',
    'zoukon', 'MelchiorBarbosa', 'MiddleCelery6616', 'Welico',
    'ikefalcon', 'Jakiller33', 'silent_dominant', 'Calth1405',
    'StarTrek238', 'Leseleff', 'ResettisReplicas', 'Shufflepants',
    'FML_HighTac', 'kreptinyos', 'MayEastRise', 'Solasykthe',
    'Fredrick_18241', 'SammyBear', 'FloydArtvega', 'zzdldl31',
    'BigSpoonFullOfSnark', 'Arimotomeku', 'Blackgaze', 'Zeranyph',
    'Ill-Wish-3150', 'dpaniagua33', 'yolopukki567', 'Ciff', 'Ciff_',
    'maxMarekt14', 'Erikrtheread', 'Reason-and-rhyme', 'lxmustdie',
    'SyntheticAperture', 'zouavez', 'skaz100', 'Twistedsocal',
    'Boomkitty', 'Holiday_inn_Cambodia', 'Icy_Orchid_1667',
    'the_scientist_dude', 'Benbever', 'Shai_aus', 'Icehawk84',
    'Warpspeed100', 'Insanitarius-', 'Jaminfine',
]

# Build combined regex for all usernames (sorted longest first)
_sorted = sorted(set(KNOWN_USERNAMES), key=lambda x: -len(x))
_UNAMES_PATTERN = '|'.join(re.escape(u) for u in _sorted)

# Russian verbs that follow usernames
_RU_VERBS = r'(?:считает|отмечает|пишет|указывает|подчёркивает|критичен|чётко|перечисляет|рассчитывает|неуверен|берёт|ставит|оценивает|предупреждает|замечает|утверждает|добавляет|предлагает|упоминает|говорит|уточняет|соглашается|спорит|аргументирует|объясняет|признаёт|согласен|несогласен|резюмирует|подтверждает|подробно)'

# English verbs that follow usernames
_EN_VERBS = r'(?:rates?|notes?|says?|thinks?|argues?|mentions?|suggests?|points?\s*out|believes?|explains?|considers?|writes?|adds?|confirms?|agrees?|disagrees?)'

# Compile combined patterns
RE_USER = re.compile(rf'(?:{_UNAMES_PATTERN})', re.IGNORECASE)

# Username: 'quote' or Username — 'quote'
RE_USER_COLON_QUOTE = re.compile(
    rf'(?:{_UNAMES_PATTERN})\s*(?::|—|–)\s*(?=[\'"])',
    re.IGNORECASE
)

# Username: text (lowercase start)
RE_USER_COLON_TEXT = re.compile(
    rf'(?:{_UNAMES_PATTERN})\s*(?::|—|–)\s+(?=[a-zа-яё])',
    re.IGNORECASE
)

# Username + Russian verb
RE_USER_RU_VERB = re.compile(
    rf'(?:{_UNAMES_PATTERN})\s+{_RU_VERBS}\s*:?\s*',
    re.IGNORECASE
)

# Username + English verb
RE_USER_EN_VERB = re.compile(
    rf'(?:{_UNAMES_PATTERN})\s+{_EN_VERBS}\s*:?\s*',
    re.IGNORECASE
)

# По Username,
RE_PO_USER = re.compile(
    rf'(?:По |по )(?:{_UNAMES_PATTERN})\s*,?\s*',
    re.IGNORECASE
)

# Username и Username
RE_USER_AND = re.compile(
    rf'(?:{_UNAMES_PATTERN})\s+и\s+',
    re.IGNORECASE
)

# Standalone username
RE_USER_STANDALONE = re.compile(
    rf'\b(?:{_UNAMES_PATTERN})\b',
    re.IGNORECASE
)


def clean_text(text):
    if not text:
        return text

    result = text

    # 1. Remove [CORRECTED: ...] markers
    result = re.sub(r'\s*\[CORRECTED:.*?\]\.?\s*', ' ', result)

    # 2. Remove (N upvotes) markers — all variants
    result = re.sub(r'\s*\(\d+\s*upvotes?!?\s*(?:—[^)]+)?\)\s*', ' ', result)
    result = re.sub(r'самый upvoted\s*', '', result)

    # 3. Remove usernames with context (order matters!)
    result = RE_USER_RU_VERB.sub('', result)
    result = RE_USER_EN_VERB.sub('', result)
    result = RE_USER_COLON_QUOTE.sub('', result)
    result = RE_USER_COLON_TEXT.sub('', result)
    result = RE_PO_USER.sub('По мнению опытных игроков, ', result)
    result = RE_USER_AND.sub('', result)
    result = RE_USER_STANDALONE.sub('', result)

    # 4. Clean "По COTD:" artifacts
    result = re.sub(r'По COTD:\s*—\s*', 'По COTD: ', result)
    result = re.sub(r'По COTD:\s*,\s*', 'По COTD: ', result)
    result = re.sub(r'По COTD:\s*и\s+', 'По COTD: ', result)
    result = re.sub(r'По COTD:\s{2,}', 'По COTD: ', result)
    result = re.sub(r'По COTD:\s*\.\s*$', '', result)

    # 5. Clean double/orphaned connectors and punctuation
    result = re.sub(r',\s*,', ',', result)
    result = re.sub(r';\s*;', ';', result)
    result = re.sub(r'\.\s*\.', '.', result)
    result = re.sub(r'—\s*—', '—', result)
    result = re.sub(r'\(\s*\)', '', result)  # empty parens
    result = re.sub(r'\s+([.,;:!?])', r'\1', result)

    # 6. Multiple spaces
    result = re.sub(r'  +', ' ', result)

    # 7. Clean trailing dashes
    result = re.sub(r'\s*—\s*$', '', result)

    return result.strip()


def main():
    with open(EVAL_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    fields_to_clean = ['reasoning', 'economy', 'when_to_pick']
    changes = 0
    verbose = '--verbose' in sys.argv

    for name, ev in data.items():
        for field in fields_to_clean:
            old_text = ev.get(field, '')
            if not old_text:
                continue
            new_text = clean_text(old_text)
            if new_text != old_text:
                ev[field] = new_text
                changes += 1
                if verbose:
                    print(f"\n--- {name}.{field} ---")
                    print(f"  OLD: {old_text[:300]}")
                    print(f"  NEW: {new_text[:300]}")

    print(f"\nTotal field changes: {changes}")

    if '--dry-run' not in sys.argv:
        with open(EVAL_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved to {EVAL_PATH}")
    else:
        print("Dry run, not saving.")


if __name__ == '__main__':
    main()
