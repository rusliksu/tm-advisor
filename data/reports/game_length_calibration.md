# Game Length Calibration

Generated: 2026-04-30T21:00:31.626Z
Finished games used: 305

## Overall

Mean 9.9, median 10, range 6-15, n=305.

## By source

| Source | n | mean | median | range |
| --- | ---: | ---: | ---: | --- |
| archive | 293 | 10 | 10 | 6-15 |
| recent_local | 12 | 9 | 9 | 8-11 |

## By player count

| Players | all n/mean | archive n/mean | recent local n/mean | runtime baseline | runtime source |
| ---: | --- | --- | --- | ---: | --- |
| 2 | 71/11.5 | 71/11.5 | 0/ | 11.5 | archive |
| 3 | 233/9.4 | 222/9.5 | 11/9 | 9 | recent_local |
| 4 | 1/9 | 0/ | 1/9 | 8.5 | fallback |
| 5 | 0/ | 0/ | 0/ | 8 | fallback |

## Main option deltas

| Feature | weighted delta | support | comment |
| --- | ---: | ---: | --- |
| wgt | -1.1 | 23 | shorter games when enabled |
| turmoil | -0.2 | 11 | shorter games when enabled |
| pathfinders | 0 | 11 | longer games when enabled |
| ceo | -0.5 | 11 | shorter games when enabled |
| twoCorps | -0.4 | 65 | shorter games when enabled |

## Frequent profiles

| n | mean | median | profile |
| ---: | ---: | ---: | --- |
| 117 | 9.7 | 10 | 3|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo |
| 24 | 11.5 | 11.5 | 2|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo |
| 19 | 9.5 | 10 | 3|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo |
| 18 | 8.3 | 9 | 3|wgt|prelude|colonies|venus|turmoil|pathfinders|ceo |
| 18 | 9.2 | 9 | 3|wgt|prelude|colonies|venus|turmoil|unknown-pathfinders|unknown-ceo |
| 18 | 8.4 | 9 | 3|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|ceo |
| 13 | 10.8 | 10 | 2|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|ceo |
| 11 | 11.6 | 12 | 2|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo |
| 11 | 9.8 | 10 | 3|wgt|prelude|unknown-colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo |
| 10 | 10 | 10 | 3|no-wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo |
| 9 | 11.1 | 11 | 2|wgt|prelude|unknown-colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo |
| 7 | 13.1 | 13 | 2|no-wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo |
| 7 | 8.9 | 9 | 3|wgt|prelude|colonies|venus|no-turmoil|no-pathfinders|no-ceo |
| 7 | 9.3 | 9 | 3|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|ceo |

## Runtime recommendation

```json
{
  "baselineByPlayerCount": {
    "2": 11.5,
    "3": 9,
    "4": 8.5,
    "5": 8
  },
  "baselineSources": {
    "2": {
      "source": "archive",
      "n": 71,
      "mean": 11.5,
      "median": 11,
      "min": 9,
      "max": 15,
      "stdev": 1.4
    },
    "3": {
      "source": "recent_local",
      "n": 11,
      "mean": 9,
      "median": 9,
      "min": 8,
      "max": 11,
      "stdev": 1
    },
    "4": {
      "source": "fallback",
      "n": 0
    },
    "5": {
      "source": "fallback",
      "n": 0
    }
  },
  "profileBaselines": {
    "3|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 9.5,
      "source": "archive_profile",
      "n": 117,
      "mean": 9.7
    },
    "2|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 11.5,
      "source": "archive_profile",
      "n": 24,
      "mean": 11.5
    },
    "3|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo": {
      "value": 9.5,
      "source": "archive_profile",
      "n": 19,
      "mean": 9.5
    },
    "3|wgt|prelude|colonies|venus|turmoil|pathfinders|ceo": {
      "value": 8.5,
      "source": "archive_profile",
      "n": 18,
      "mean": 8.3
    },
    "3|wgt|prelude|colonies|venus|turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 9,
      "source": "archive_profile",
      "n": 18,
      "mean": 9.2
    },
    "3|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|ceo": {
      "value": 8.5,
      "source": "archive_profile",
      "n": 18,
      "mean": 8.4
    },
    "2|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|ceo": {
      "value": 11,
      "source": "archive_profile",
      "n": 13,
      "mean": 10.8
    },
    "2|wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo": {
      "value": 11.5,
      "source": "archive_profile",
      "n": 11,
      "mean": 11.6
    },
    "3|wgt|prelude|unknown-colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 10,
      "source": "archive_profile",
      "n": 11,
      "mean": 9.8
    },
    "3|no-wgt|prelude|colonies|venus|unknown-turmoil|pathfinders|unknown-ceo": {
      "value": 10,
      "source": "archive_profile",
      "n": 10,
      "mean": 10
    },
    "2|wgt|prelude|unknown-colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 11,
      "source": "archive_profile",
      "n": 9,
      "mean": 11.1
    },
    "2|no-wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|unknown-ceo": {
      "value": 13,
      "source": "archive_profile",
      "n": 7,
      "mean": 13.1
    },
    "3|wgt|prelude|colonies|venus|unknown-turmoil|unknown-pathfinders|ceo": {
      "value": 9.5,
      "source": "archive_profile",
      "n": 7,
      "mean": 9.3
    },
    "3|wgt|prelude|colonies|venus|no-turmoil|no-pathfinders|no-ceo": {
      "value": 9,
      "source": "recent_local_profile",
      "n": 7,
      "mean": 8.9
    }
  },
  "notes": [
    "Prefer recent_local when n >= 8 for a player count; otherwise use archive if n >= 10.",
    "Exact profile baselines override player-count baselines when enough finished games share the same option profile.",
    "Local game_start logs do not store Prelude explicitly; current local server profiles are treated as Prelude-enabled."
  ]
}
```
