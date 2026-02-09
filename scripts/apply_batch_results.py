"""Apply batch re-evaluation results to evaluations.json."""
import json
import os
import sys
import glob

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def apply_results(results_files):
    """Apply all result files to evaluations.json."""
    with open(os.path.join(DATA_DIR, "evaluations.json"), "r", encoding="utf-8") as f:
        evals = json.load(f)

    total_changes = 0
    total_cards = 0

    for rfile in results_files:
        with open(rfile, "r", encoding="utf-8") as f:
            results = json.load(f)

        for r in results:
            name = r.get("name")
            if not name or name not in evals:
                print(f"  WARNING: {name} not found in evaluations")
                continue

            total_cards += 1
            old_tier = evals[name].get("tier", "?")
            old_score = evals[name].get("score", 0)
            new_tier = r.get("tier", old_tier)
            new_score = r.get("score", old_score)

            if old_tier != new_tier or old_score != new_score:
                total_changes += 1

            evals[name]["tier"] = new_tier
            evals[name]["score"] = new_score

            # Update reasoning if provided
            if r.get("reasoning"):
                evals[name]["reasoning"] = r["reasoning"]
            if r.get("economy"):
                evals[name]["economy"] = r["economy"]
            if r.get("synergies"):
                evals[name]["synergies"] = r["synergies"]
            if r.get("when_to_pick"):
                evals[name]["when_to_pick"] = r["when_to_pick"]

    print(f"Applied {total_cards} cards, {total_changes} changes")

    with open(os.path.join(DATA_DIR, "evaluations.json"), "w", encoding="utf-8") as f:
        json.dump(evals, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    # Find all result files
    pattern = os.path.join(DATA_DIR, "reevaluation_results_*.json")
    results_files = sorted(glob.glob(pattern))
    if not results_files:
        print("No result files found. Expected data/reevaluation_results_*.json")
        sys.exit(1)

    print(f"Found {len(results_files)} result files")
    apply_results(results_files)
