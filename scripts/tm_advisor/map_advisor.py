"""Map Placement Advisor — анализ карты для размещения тайлов."""

from .constants import (
    TILE_GREENERY, TILE_OCEAN, TILE_CITY,
    BONUS_TITANIUM, BONUS_STEEL, BONUS_PLANT, BONUS_CARD, BONUS_HEAT,
    _EVEN_Y_NEIGHBORS, _ODD_Y_NEIGHBORS,
)


def _get_neighbors(x: int, y: int) -> list[tuple[int, int]]:
    """Get hex neighbor coordinates for TM offset hex grid."""
    offsets = _EVEN_Y_NEIGHBORS if y % 2 == 0 else _ODD_Y_NEIGHBORS
    return [(x + dx, y + dy) for dx, dy in offsets]


def _analyze_map(state) -> dict:
    """Analyze map for placement recommendations.

    Returns dict with:
        best_city: [(id, x, y, score, reason)] top city spots
        best_greenery: [(id, x, y, score, reason)] top greenery spots
        my_cities: number of player's cities
        my_greeneries: number of player's greeneries
        total_oceans: number of placed oceans
    """
    spaces = state.spaces
    if not spaces:
        return {}

    my_color = state.me.color

    # Build lookup
    by_pos: dict[tuple[int, int], dict] = {}
    by_id: dict[str, dict] = {}
    for s in spaces:
        x, y = s.get("x", -1), s.get("y", -1)
        if x >= 0 and y >= 0:
            by_pos[(x, y)] = s
            by_id[s["id"]] = s

    # Count my tiles
    my_cities = sum(1 for s in spaces
                    if s.get("tileType") == TILE_CITY and s.get("color") == my_color)
    my_greeneries = sum(1 for s in spaces
                        if s.get("tileType") == TILE_GREENERY and s.get("color") == my_color)
    total_oceans = sum(1 for s in spaces if s.get("tileType") == TILE_OCEAN)

    # Find empty land spaces
    empty = [s for s in spaces if s.get("tileType") is None
             and s.get("spaceType") == "land" and s.get("x", -1) >= 0]

    # Score city spots: adjacency value
    city_spots = []
    for s in empty:
        x, y = s["x"], s["y"]
        score = 0
        reasons = []

        # Placement bonus
        for b in s.get("bonus", []):
            if b == BONUS_STEEL:
                score += 2
            elif b == BONUS_TITANIUM:
                score += 3
            elif b == BONUS_PLANT:
                score += 2
            elif b == BONUS_CARD:
                score += 3.5
            elif b == BONUS_HEAT:
                score += 1

        # Adjacent tile bonuses
        neighbors = _get_neighbors(x, y)
        adj_oceans = 0
        adj_greenery = 0
        adj_my_tiles = 0
        adj_empty = 0
        for nx, ny in neighbors:
            ns = by_pos.get((nx, ny))
            if not ns:
                continue
            tt = ns.get("tileType")
            if tt == TILE_OCEAN:
                adj_oceans += 1
                score += 2  # +2 MC placement bonus per adjacent ocean
            elif tt == TILE_GREENERY:
                adj_greenery += 1
                score += 1  # +1 VP per adjacent greenery (city VP)
            if ns.get("color") == my_color:
                adj_my_tiles += 1
                score += 1  # clustering bonus
            if tt is None and ns.get("spaceType") == "land":
                adj_empty += 1

        if adj_oceans:
            reasons.append(f"{adj_oceans} ocean(+{adj_oceans * 2} MC)")
        if adj_greenery:
            reasons.append(f"{adj_greenery} green(+{adj_greenery} VP)")
        if adj_my_tiles:
            reasons.append(f"near {adj_my_tiles} своих")
        if adj_empty >= 3:
            reasons.append(f"{adj_empty} пусто(room)")

        # Room for future greeneries near this city
        score += min(adj_empty, 3) * 0.5

        city_spots.append((s["id"], x, y, round(score, 1), ", ".join(reasons) or "нет бонусов"))

    city_spots.sort(key=lambda x: x[3], reverse=True)

    # Score greenery spots: prefer near own cities, next to oceans
    greenery_spots = []
    for s in empty:
        x, y = s["x"], s["y"]
        score = 0
        reasons = []

        # Must be adjacent to own tile (unless no tiles placed)
        neighbors = _get_neighbors(x, y)
        adj_my_cities = 0
        adj_oceans = 0
        near_own = False

        for nx, ny in neighbors:
            ns = by_pos.get((nx, ny))
            if not ns:
                continue
            if ns.get("color") == my_color:
                near_own = True
                if ns.get("tileType") == TILE_CITY:
                    adj_my_cities += 1
                    score += 3  # +1 VP for city adjacency
            if ns.get("tileType") == TILE_OCEAN:
                adj_oceans += 1
                score += 2  # +2 MC placement bonus

        # Placement bonus
        for b in s.get("bonus", []):
            if b == BONUS_PLANT:
                score += 2
            elif b == BONUS_STEEL:
                score += 2
            elif b == BONUS_CARD:
                score += 3.5
            elif b == BONUS_TITANIUM:
                score += 3

        if not near_own and my_cities + my_greeneries > 0:
            score -= 10  # strong penalty: greenery should be near own tiles

        if adj_my_cities:
            reasons.append(f"adj {adj_my_cities} city (+{adj_my_cities} VP)")
        if adj_oceans:
            reasons.append(f"{adj_oceans} ocean(+{adj_oceans * 2} MC)")

        greenery_spots.append((s["id"], x, y, round(score, 1), ", ".join(reasons) or ""))

    greenery_spots.sort(key=lambda x: x[3], reverse=True)

    return {
        "best_city": city_spots[:5],
        "best_greenery": greenery_spots[:5],
        "my_cities": my_cities,
        "my_greeneries": my_greeneries,
        "total_oceans": total_oceans,
    }
