"""
Подготовка TierMaker templates: ресайз изображений до 150x200px
и генерация ranking.txt для ручной расстановки.
"""

import json
import os
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow не установлен. Установите: pip install Pillow")
    raise SystemExit(1)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

TARGET_WIDTH = 150
TARGET_HEIGHT = 200

TIER_ORDER = ["S", "A", "B", "C", "D", "F"]

CATEGORY_MAP = {
    "corps": {"types": {"corporation"}, "dir": "tiermaker_template_corps"},
    "preludes": {"types": {"prelude"}, "dir": "tiermaker_template_preludes"},
    "projects": {"types": {"active", "automated", "event"}, "dir": "tiermaker_template_projects"},
}


def load_data():
    with open(DATA_DIR / "evaluations.json", "r", encoding="utf-8") as f:
        evaluations = json.load(f)
    with open(DATA_DIR / "card_index.json", "r", encoding="utf-8") as f:
        card_index = json.load(f)
    with open(DATA_DIR / "image_mapping.json", "r", encoding="utf-8") as f:
        image_mapping = json.load(f)
    return evaluations, card_index, image_mapping


def resize_image(src_path, dst_path, width=TARGET_WIDTH, height=TARGET_HEIGHT):
    """Ресайз изображения с сохранением пропорций и padding."""
    with Image.open(src_path) as img:
        img = img.convert("RGB")
        # Fit image within target dimensions preserving aspect ratio
        img.thumbnail((width, height), Image.LANCZOS)

        # Create target-size canvas and paste centered
        canvas = Image.new("RGB", (width, height), (20, 20, 40))
        x = (width - img.width) // 2
        y = (height - img.height) // 2
        canvas.paste(img, (x, y))
        canvas.save(dst_path, "PNG", optimize=True)


def main():
    evaluations, card_index, image_mapping = load_data()

    ranking_lines = []

    for cat_key, cat_info in CATEGORY_MAP.items():
        allowed_types = cat_info["types"]
        out_dir = OUTPUT_DIR / cat_info["dir"]
        out_dir.mkdir(parents=True, exist_ok=True)

        # Collect cards for this category
        cards_by_tier = {t: [] for t in TIER_ORDER}
        for name, ev in evaluations.items():
            card_type = card_index.get(name, {}).get("type", "")
            if card_type not in allowed_types:
                continue
            tier = ev.get("tier", "C")
            if tier not in cards_by_tier:
                tier = "C"
            cards_by_tier[tier].append((name, ev.get("score", 0)))

        # Sort by score descending within each tier
        for tier in TIER_ORDER:
            cards_by_tier[tier].sort(key=lambda x: -x[1])

        # Process images and build ranking
        resized_count = 0
        skipped_count = 0

        ranking_lines.append(f"\n{'='*60}")
        ranking_lines.append(f"  {cat_key.upper()}")
        ranking_lines.append(f"{'='*60}")

        for tier in TIER_ORDER:
            cards = cards_by_tier[tier]
            if not cards:
                continue

            ranking_lines.append(f"\n--- {tier} Tier ---")

            for name, score in cards:
                img_src = image_mapping.get(name, "")
                safe_name = name.replace(" ", "_").replace("'", "").replace('"', "")
                safe_name = "".join(c for c in safe_name if c.isalnum() or c in "_-")

                if img_src:
                    src_path = BASE_DIR / img_src.replace("/", os.sep)
                    if src_path.exists():
                        dst_path = out_dir / f"{safe_name}.png"
                        resize_image(src_path, dst_path)
                        resized_count += 1
                    else:
                        skipped_count += 1
                else:
                    skipped_count += 1

                ranking_lines.append(f"  {score:3d}  {name}")

        print(f"{cat_key}: {resized_count} изображений ресайзнуто, {skipped_count} пропущено (нет изображения)")

    # Write ranking file
    ranking_path = OUTPUT_DIR / "tiermaker_ranking.txt"
    with open(ranking_path, "w", encoding="utf-8") as f:
        f.write("TERRAFORMING MARS TIER LIST — RANKING\n")
        f.write("Формат: 3P / WGT / All Expansions\n")
        f.write("\n".join(ranking_lines))
        f.write("\n")

    print(f"\nRanking: {ranking_path}")
    print("Готово!")


if __name__ == "__main__":
    main()
