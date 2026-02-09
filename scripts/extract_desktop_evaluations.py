"""Extract evaluations from Desktop/Марс markdown files into structured JSON."""
import json
import re
import os

DESKTOP_DIR = os.path.expanduser("~/Desktop/Марс")

def extract_corps(filepath):
    """Extract corporation evaluations from the Desktop tier list."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    cards = []
    current_tier = None
    position = 0

    # Split by ### headers
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect tier changes
        if "S-Tier" in line and line.startswith("##"):
            current_tier = "S"
        elif "A-Tier" in line and line.startswith("##"):
            current_tier = "A"
        elif "B-Tier" in line and line.startswith("##"):
            current_tier = "B"
        elif "C-Tier" in line and line.startswith("##"):
            current_tier = "C"
        elif "D-Tier" in line and line.startswith("##"):
            current_tier = "D"
        elif "F-Tier" in line and line.startswith("##"):
            current_tier = "F"

        # Detect card entries: ### N. [emoji] Name *(Expansion)*
        if line.startswith("### ") and current_tier:
            # Remove emoji characters
            clean = re.sub(r'[\U0001F000-\U0001F9FF\U00002600-\U000027BF\U0001FA00-\U0001FA9F\U0001FAA0-\U0001FAFF]', '', line)
            # Try to match: ### N. Name *(Expansion)*
            m = re.match(r'###\s+(\d+)\.\s+(.+?)(?:\s*\*\(.*?\)\*)?$', clean.strip())
            if m:
                position = int(m.group(1))
                name = m.group(2).strip().rstrip("*").strip()

                # Collect reasoning until next ---
                reasoning_lines = []
                j = i + 1
                while j < len(lines):
                    if lines[j].strip() == "---" or (lines[j].strip().startswith("### ") and re.match(r'###\s+\d+\.', lines[j].strip())):
                        break
                    if lines[j].strip().startswith("##") and ("Tier" in lines[j] or "Заключение" in lines[j]):
                        break
                    reasoning_lines.append(lines[j])
                    j += 1

                reasoning_text = "\n".join(reasoning_lines).strip()

                # Extract the "why" section
                why_match = re.search(r'Почему.*?:\*?\*?\s*\n?(.*?)(?=\n\*\*[✅🔗]|\n---|\Z)', reasoning_text, re.DOTALL)
                why_text = why_match.group(1).strip() if why_match else ""

                cards.append({
                    "name": name,
                    "tier": current_tier,
                    "position": position,
                    "type": "corporation",
                    "reasoning": why_text[:500] if why_text else ""
                })
        i += 1

    return cards


def extract_preludes(filepath):
    """Extract prelude evaluations from Desktop tier list."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    cards = []
    current_tier = None

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect tier changes
        if "S-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "S"
        elif "A-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "A"
        elif "B-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "B"
        elif "C-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "C"
        elif "D-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "D"
        elif "F-Tier" in line and line.startswith("##") and not line.startswith("###"):
            current_tier = "F"

        # Detect card entries: ### N. Name or ### N. Name (Expansion)
        if line.startswith("### ") and current_tier:
            m = re.match(r'###\s+(\d+)\.\s+(.+?)(?:\s*\(.*?\))?\s*$', line)
            if m:
                position = int(m.group(1))
                name = m.group(2).strip()

                # Collect info
                math_value = None
                reasoning = ""
                j = i + 1
                while j < len(lines):
                    l = lines[j].strip()
                    if l.startswith("### ") and re.match(r'###\s+\d+\.', l):
                        break
                    if l.startswith("##") and not l.startswith("###") and ("Tier" in l or "---" in l):
                        break

                    # Extract math value
                    mv = re.search(r'Математическая ценность:\*?\*?\s*~?(\d+[\.\d]*)', l)
                    if mv:
                        math_value = float(mv.group(1))

                    # Extract why text
                    if "Почему в" in l:
                        why_lines = []
                        k = j
                        # Get the rest of the line after colon
                        colon_part = l.split(":", 1)
                        if len(colon_part) > 1:
                            why_lines.append(colon_part[1].strip())
                        k = j + 1
                        while k < len(lines):
                            kl = lines[k].strip()
                            if kl.startswith("**") or kl.startswith("###") or kl.startswith("##") or kl == "---":
                                break
                            if kl:
                                why_lines.append(kl)
                            k += 1
                        reasoning = " ".join(why_lines).strip()

                    j += 1

                cards.append({
                    "name": name,
                    "tier": current_tier,
                    "position": position,
                    "type": "prelude",
                    "math_value": math_value,
                    "reasoning": reasoning[:500]
                })
        i += 1

    return cards


def extract_projects(filepath, default_tier=None):
    """Extract project card evaluations from Desktop tier list files."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    cards = []
    current_tier = default_tier

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Detect tier changes from section headers
        if not line.startswith("###"):
            if "S-Tier" in line and line.startswith("##"):
                current_tier = "S"
            elif "A-Tier" in line and line.startswith("##"):
                current_tier = "A"
            elif "B-Tier" in line and line.startswith("##"):
                current_tier = "B"
            elif "C-Tier" in line and line.startswith("##"):
                current_tier = "C"
            elif "D-Tier" in line and line.startswith("##"):
                current_tier = "D"
            elif "F-Tier" in line and line.startswith("##"):
                current_tier = "F"

        # Detect card entries: ## N. Card Name (Cost MC) or ### N. Card Name
        if (line.startswith("## ") or line.startswith("### ")) and current_tier:
            # Try multiple patterns
            m = re.match(r'##?#?\s+(\d+)\.\s+(.+?)(?:\s*\((\d+)\s*М€\))?\s*(?:—.*)?$', line)
            if m:
                position = int(m.group(1))
                name = m.group(2).strip().rstrip("*").strip()
                cost = int(m.group(3)) if m.group(3) else None

                # Remove trailing expansion info in parens
                name = re.sub(r'\s*\((?:Prelude 2|Colonies|Venus Next|Turmoil|Promo|Базовая|Big Box).*?\)\s*$', '', name).strip()
                # Remove trailing "— только с дополнением..."
                name = re.sub(r'\s*—\s*только с.*$', '', name).strip()

                # Collect reasoning
                reasoning = ""
                j = i + 1
                while j < len(lines):
                    l = lines[j].strip()
                    if re.match(r'##?#?\s+\d+\.', l):
                        break
                    if l.startswith("##") and not l.startswith("###") and ("Tier" in l or "Заключение" in l):
                        break

                    if "Почему в" in l:
                        why_lines = []
                        colon_part = l.split(":", 1)
                        if len(colon_part) > 1:
                            why_lines.append(colon_part[1].strip())
                        k = j + 1
                        while k < len(lines):
                            kl = lines[k].strip()
                            if kl.startswith("**") or re.match(r'##?#?\s+\d+\.', kl) or kl == "---":
                                break
                            if kl:
                                why_lines.append(kl)
                            k += 1
                        reasoning = " ".join(why_lines).strip()

                    j += 1

                cards.append({
                    "name": name,
                    "tier": current_tier,
                    "position": position,
                    "type": "project",
                    "reasoning": reasoning[:500]
                })
        i += 1

    return cards


def main():
    all_desktop = []

    # Corps
    corps_file = os.path.join(DESKTOP_DIR, "Тир-лист корпораций Terraforming Mars (красивый markdown).md")
    if os.path.exists(corps_file):
        corps = extract_corps(corps_file)
        all_desktop.extend(corps)
        print(f"Corps: {len(corps)} extracted")
        for t in ["S", "A", "B", "C", "D"]:
            tier_cards = [c for c in corps if c["tier"] == t]
            if tier_cards:
                print(f"  {t}: {', '.join(c['name'] for c in tier_cards)}")

    # Preludes
    preludes_file = os.path.join(DESKTOP_DIR, "Полный тир-лист прелюдий Terraforming Mars (исправленный с корректными расчетами).md")
    if os.path.exists(preludes_file):
        preludes = extract_preludes(preludes_file)
        all_desktop.extend(preludes)
        print(f"\nPreludes: {len(preludes)} extracted")
        for t in ["S", "A", "B", "C", "D"]:
            tier_cards = [c for c in preludes if c["tier"] == t]
            if tier_cards:
                print(f"  {t}: {', '.join(c['name'] for c in tier_cards)}")

    # Projects - S tier
    s_file = os.path.join(DESKTOP_DIR, "S-Tier проекты Terraforming Mars (обновленный с подтверждением Ecological Zone).md")
    if os.path.exists(s_file):
        s_cards = extract_projects(s_file, default_tier="S")
        all_desktop.extend(s_cards)
        print(f"\nS-tier projects: {len(s_cards)} extracted")
        for c in s_cards:
            print(f"  {c['position']}. {c['name']}")

    # Projects - A tier
    a_file = os.path.join(DESKTOP_DIR, "Полный тир-лист A-Tier проектов Terraforming Mars (обновленный с Public Plans).md")
    if os.path.exists(a_file):
        a_cards = extract_projects(a_file, default_tier="A")
        all_desktop.extend(a_cards)
        print(f"\nA-tier projects: {len(a_cards)} extracted")
        for c in a_cards:
            print(f"  {c['position']}. {c['name']}")

    # Projects - B tier
    b_file = os.path.join(DESKTOP_DIR, "B-Tier проекты Terraforming Mars (обновленный с Water Import from Europa).md")
    if os.path.exists(b_file):
        b_cards = extract_projects(b_file, default_tier="B")
        all_desktop.extend(b_cards)
        print(f"\nB-tier projects: {len(b_cards)} extracted")
        for c in b_cards:
            print(f"  {c['position']}. {c['name']}")

    # Projects - C+D tier
    cd_file = os.path.join(DESKTOP_DIR, "C-Tier проекты Terraforming Mars (обновленный с Commercial District и корректировками).md")
    if os.path.exists(cd_file):
        cd_cards = extract_projects(cd_file, default_tier="C")
        all_desktop.extend(cd_cards)
        print(f"\nC+D tier projects: {len(cd_cards)} extracted")
        for t in ["C", "D"]:
            tier_cards = [c for c in cd_cards if c["tier"] == t]
            if tier_cards:
                print(f"  {t}: {len(tier_cards)} cards")

    # Projects - D tier
    d_file = os.path.join(DESKTOP_DIR, "D-Tier проекты Terraforming Mars (обновленный с Floater Leasing).md")
    if os.path.exists(d_file):
        d_cards = extract_projects(d_file, default_tier="D")
        all_desktop.extend(d_cards)
        print(f"\nD tier projects: {len(d_cards)} extracted")
        for c in d_cards:
            print(f"  {c['position']}. {c['name']}")

    # Save
    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "desktop_evaluations.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_desktop, f, ensure_ascii=False, indent=2)

    print(f"\n=== TOTAL: {len(all_desktop)} cards saved to {output_path} ===")

    # Summary by type and tier
    by_type = {}
    for c in all_desktop:
        t = c["type"]
        if t not in by_type:
            by_type[t] = {}
        tier = c["tier"]
        by_type[t][tier] = by_type[t].get(tier, 0) + 1

    print("\nSummary:")
    for t, tiers in by_type.items():
        total = sum(tiers.values())
        tier_str = ", ".join(f"{k}:{v}" for k, v in sorted(tiers.items()))
        print(f"  {t}: {total} ({tier_str})")


if __name__ == "__main__":
    main()
