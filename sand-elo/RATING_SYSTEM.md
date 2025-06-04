# SandScore Rating System Documentation

## 🚨 UPDATE: Now Using Glicko System
**As of June 2025, SandScore has migrated from Elo to the Glicko rating system.** 

See [GLICKO_SYSTEM.md](./GLICKO_SYSTEM.md) for the current implementation details.

## Legacy Elo Documentation (Historical Reference)
The information below describes the original Elo system used before the Glicko migration.

## Basic Elo Formula
The core Elo rating calculation uses the standard formula:

```
New Rating = Old Rating + K × (Actual Score - Expected Score)
```

Where:
- **K** = K-factor (determines how much ratings can change)
- **Actual Score** = 1 for win, 0 for loss
- **Expected Score** = Probability of winning based on rating difference

## Expected Score Calculation
The expected score (win probability) is calculated using:

```
Expected Score = 1 / (1 + 10^((Opponent Rating - Player Rating) / 400))
```

## Team Rating Calculation
In 2v2 volleyball, we calculate team ratings as:

```
Team Rating = (Player 1 Rating + Player 2 Rating) / 2
```

## Dynamic K-Factor
The K-factor varies based on player experience:

- **New players (< 10 matches)**: K = 40
- **Intermediate players (10-30 matches)**: K = 30  
- **Experienced players (> 30 matches)**: K = 20

This allows new players' ratings to adjust quickly while experienced players have more stable ratings.

## Rating Change Calculation Process

### Step 1: Get Current Ratings
```sql
-- Get all player ratings for the match type
SELECT 
  team1_player1_rating,
  team1_player2_rating,
  team2_player1_rating,
  team2_player2_rating
FROM match_details
WHERE match_type = 'mens' -- or 'womens', 'coed'
```

### Step 2: Calculate Team Ratings
```
team1_rating = (team1_player1_rating + team1_player2_rating) / 2
team2_rating = (team2_player1_rating + team2_player2_rating) / 2
```

### Step 3: Calculate Expected Scores
```
team1_expected = 1 / (1 + 10^((team2_rating - team1_rating) / 400))
team2_expected = 1 - team1_expected
```

### Step 4: Determine K-Factors
For each player, count their matches and apply the appropriate K-factor:
```sql
SELECT COUNT(*) as match_count
FROM matches
WHERE player_id IN (team1_player1_id, team1_player2_id, ...)
```

### Step 5: Calculate Rating Changes
For the winning team:
```
rating_change = k_factor × (1 - expected_score)
```

For the losing team:
```
rating_change = k_factor × (0 - expected_score)
```

### Step 6: Apply Rating Ceiling
Ratings are capped at 3000 to prevent runaway inflation:
```
new_rating = MIN(old_rating + rating_change, 3000)
```

## Example Calculation

**Match Setup:**
- Team 1: Alice (1600) + Bob (1500) = Average 1550
- Team 2: Carol (1450) + Dave (1400) = Average 1425
- Result: Team 1 wins

**Calculations:**
1. Team 1 expected score: 1 / (1 + 10^((1425-1550)/400)) = 0.68
2. Team 2 expected score: 1 - 0.68 = 0.32

**Rating Changes (assuming K=30 for all):**
- Alice: 1600 + 30 × (1 - 0.68) = 1600 + 9.6 = **1610**
- Bob: 1500 + 30 × (1 - 0.68) = 1500 + 9.6 = **1510**
- Carol: 1450 + 30 × (0 - 0.32) = 1450 - 9.6 = **1440**
- Dave: 1400 + 30 × (0 - 0.32) = 1400 - 9.6 = **1390**

## Match Types and Separate Ratings
Players maintain separate ratings for each match type:
- **Men's doubles**: `mens_rating`
- **Women's doubles**: `womens_rating`
- **Co-ed doubles**: `coed_rating`

This prevents skill differences between formats from affecting ratings unfairly.

## Database Implementation

### Rating History Tracking
Every rating change is recorded in the `rating_history` table:
```sql
CREATE TABLE rating_history (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES profiles(id),
  match_id UUID REFERENCES matches(id),
  match_type VARCHAR(10),
  old_rating INTEGER,
  new_rating INTEGER,
  rating_change INTEGER,
  k_factor INTEGER,
  expected_score DECIMAL(5,4),
  created_at TIMESTAMPTZ
);
```

### Automatic Calculation
Rating updates happen automatically via database trigger when a match is created:
```sql
CREATE TRIGGER calculate_ratings_after_match
AFTER INSERT ON matches
FOR EACH ROW
EXECUTE FUNCTION calculate_match_ratings();
```

## Special Cases

### Unbalanced Teams
If a match has uneven teams (e.g., 1v2), the system still calculates based on average ratings, giving the smaller team a theoretical teammate with their own rating.

### New Players
New players start at 1500 rating (the midpoint) and have a higher K-factor to quickly find their true skill level.

### Rating Floors
Ratings cannot go below 100 to maintain meaningful differences between skill levels.

## Implementation Notes

1. **Atomicity**: All rating updates for a match happen in a single transaction
2. **Consistency**: Team ratings are always calculated the same way
3. **History**: Every rating change is logged for transparency
4. **Recalculation**: If a match result is edited, ratings are recalculated only if the winner changes

## API Usage

To get a player's current ratings:
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('mens_rating, womens_rating, coed_rating')
  .eq('id', userId)
  .single()
```

To get rating history:
```typescript
const { data: history } = await supabase
  .from('rating_history')
  .select('*')
  .eq('player_id', userId)
  .order('created_at', { ascending: false })
```

## Future Improvements

1. **Momentum Factor**: Consider recent performance trends
2. **Surface Adjustment**: Different ratings for beach vs indoor
3. **Tournament Mode**: Temporary K-factor boost for competitive events
4. **Team Chemistry**: Bonus/penalty for established partnerships