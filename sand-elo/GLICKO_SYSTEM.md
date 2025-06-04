# Glicko Rating System Implementation

## Overview

SandScore now uses the **Glicko rating system** instead of traditional Elo. This provides more accurate ratings by tracking both skill level and rating uncertainty.

## Key Differences from Elo

### 1. Two-Component Ratings
- **Rating**: Your skill level (same scale as Elo, 1500 = average)
- **Rating Deviation (RD)**: How certain we are about your rating (350 = new player, <100 = established)

### 2. Confidence Levels
- Displayed as percentage: `100 - (RD / 350) * 100`
- New players: ~0% confidence
- Regular players: 70-90% confidence
- Very active players: 90%+ confidence

### 3. Inactive Player Handling
- RD increases by 10% per month of inactivity
- Returns to "new player" uncertainty after ~1 year
- Rating remains but becomes less reliable

### 4. Score Margin Matters
- Close games (21-19): 1.05x multiplier
- Clear wins (21-15): 1.15x multiplier  
- Dominant wins (21-10): 1.25x multiplier
- Blowouts (21-5): 1.35x multiplier

## Database Schema

### Player Ratings
```sql
profiles:
  - mens_rating: FLOAT
  - mens_rating_deviation: FLOAT
  - womens_rating: FLOAT
  - womens_rating_deviation: FLOAT
  - coed_rating: FLOAT
  - coed_rating_deviation: FLOAT
  - last_played_at: TIMESTAMP

player_rating_history: (Type 2 SCD)
  - rating: FLOAT
  - rating_deviation: FLOAT
  - confidence_level: FLOAT (generated)
  - valid_from: TIMESTAMP
  - valid_to: TIMESTAMP (NULL = current)
  - is_current: BOOLEAN
```

### Team Ratings
```sql
team_ratings:
  - mens_rating: FLOAT
  - mens_rating_deviation: FLOAT
  - (same for womens/coed)

team_rating_history: (Type 2 SCD)
  - Similar structure to player history
  - synergy_bonus: FLOAT (future feature)
```

## 2v2 Match Processing

Each match creates 8 rating updates:
```
Match: Alice/Bob defeat Carol/Dave 21-15

Updates:
1. Alice vs Carol (win, margin 6)
2. Alice vs Dave (win, margin 6)
3. Bob vs Carol (win, margin 6)
4. Bob vs Dave (win, margin 6)
5. Carol vs Alice (loss, margin 6)
6. Carol vs Bob (loss, margin 6)
7. Dave vs Alice (loss, margin 6)
8. Dave vs Bob (loss, margin 6)
```

## Key Functions

### Core Calculations
- `glicko_g(rd)`: G-factor based on opponent's RD
- `glicko_expected_score(r1, r2, rd2)`: Win probability
- `calculate_glicko_update(...)`: Main rating update logic
- `score_margin_multiplier(margin)`: Bonus for dominant wins

### Processing Functions  
- `process_2v2_glicko_match()`: Updates all 4 players
- `update_team_glicko_ratings()`: Updates team ratings
- `decay_rd()`: Increases RD for inactive players

### Weekly Jobs
- `snapshot_player_ratings()`: Creates Type 2 history records
- `snapshot_team_ratings()`: Creates team history records
- `recalculate_all_glicko_ratings(iterations)`: Full recalculation

## UI Changes

### Standings Page
- Shows rating with confidence: "1650" with "85% conf"
- Works for both individual and team standings

### Player/Team Profiles
- Displays current rating and confidence level
- Rating history from Type 2 tables
- Charts show weekly snapshots

## Migration Notes

1. All existing matches were recalculated with 5 iterations
2. Initial RD set to 350 for all players
3. Historical rating_history preserved for reference
4. Type 2 tables track changes week-to-week

## Testing

Run Glicko tests:
```bash
npm test tests/glicko.test.ts
```

Tests cover:
- G-factor calculation
- Expected score calculation  
- Score margin multipliers
- RD decay
- Full rating updates
- 2v2 match processing
- Weekly snapshots

## Future Enhancements

1. **Synergy Bonus**: Track team chemistry over time
2. **Confidence Intervals**: Show rating ± 2*RD on charts
3. **Provisional Ratings**: Special handling for <10 matches
4. **Cross-Region Calibration**: Adjust for different player pools