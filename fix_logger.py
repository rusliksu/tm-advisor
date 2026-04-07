"""Fix CORP_NAMES insertion in tm-game-logger.py"""
path = "/home/openclaw/terraforming-mars/tm-game-logger.py"
with open(path) as f:
    lines = f.readlines()

# Remove the bad CORP_NAMES line (if exists)
new_lines = []
for line in lines:
    if line.startswith("CORP_NAMES = set("):
        continue
    new_lines.append(line)

# Check if CORP_NAMES already exists properly
has_corp = any(line.startswith("CORP_NAMES = {") for line in new_lines)

if not has_corp:
    # Insert CORP_NAMES before DISPLAY_LABELS
    final_lines = []
    for line in new_lines:
        if line.startswith("DISPLAY_LABELS = {"):
            corps = [
                "Agricola Inc", "Aphrodite", "Arcadian Communities", "Aridor", "Arklight",
                "Astrodrill", "Athena", "Beginner Corporation", "Celestic", "Cheung Shing MARS",
                "CrediCor", "EcoLine", "Eris", "Factorum", "Helion", "Incite",
                "Interplanetary Cinematics", "Inventrix", "Junk Ventures", "Lakefront Resorts",
                "Manutech", "Midas", "Mining Guild", "Mons Insurance", "Morning Star Inc.",
                "Pharmacy Union", "Philares", "PhoboLog", "Playwrights", "Point Luna",
                "Polyphemos", "Poseidon", "Pristar", "Project Workshop", "Recyclon",
                "Robinson Industries", "Saturn Systems", "Septem Tribus", "Splice",
                "Stormcraft Incorporated", "Teractor", "Terralabs Research", "Tharsis Republic",
                "Thorgate", "United Nations Mars Initiative", "United Nations Mission One",
                "Utopia Invest", "Valley Trust", "Viron", "Vitor",
            ]
            final_lines.append("CORP_NAMES = {\n")
            for i in range(0, len(corps), 4):
                batch = corps[i:i+4]
                quoted = ', '.join('"' + c + '"' for c in batch)
                final_lines.append("    " + quoted + ",\n")
            final_lines.append("}\n\n")
        final_lines.append(line)
    new_lines = final_lines

with open(path, "w") as f:
    f.writelines(new_lines)
print("OK - CORP_NAMES fixed")
