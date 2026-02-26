# Generate Daily Punditry Snippets

You are generating daily punditry snippets for the Football Prediction Game. Follow these steps exactly.

## Step 1: Read Tournament Context

Use the Supabase MCP tool (`execute_sql`) to gather context. The Supabase project ID is `modjoikyuhqzouxvieua`.

Run this SQL to get the tournament and leaderboard:

```sql
SELECT t.id, t.name, t.status,
  json_agg(json_build_object(
    'name', COALESCE(p.nickname, p.display_name),
    'total_points', te.total_points,
    'overall_rank', te.overall_rank,
    'group_stage_points', te.group_stage_points,
    'knockout_points', te.knockout_points
  ) ORDER BY te.overall_rank ASC NULLS LAST) AS leaderboard
FROM tournaments t
JOIN tournament_entries te ON te.tournament_id = t.id
JOIN players p ON p.id = te.player_id
WHERE t.slug = 'world-cup-2026'
GROUP BY t.id, t.name, t.status;
```

Run this SQL for recent results:

```sql
SELECT ht.name AS home, gm.home_score, gm.away_score, at.name AS away
FROM group_matches gm
JOIN teams ht ON ht.id = gm.home_team_id
JOIN teams at ON at.id = gm.away_team_id
WHERE gm.home_score IS NOT NULL
ORDER BY gm.sort_order DESC
LIMIT 10;
```

Run this SQL for recent chat:

```sql
SELECT COALESCE(p.nickname, p.display_name) AS name, cm.content
FROM chat_messages cm
JOIN players p ON p.id = cm.player_id
JOIN tournaments t ON t.id = cm.tournament_id
WHERE t.slug = 'world-cup-2026'
ORDER BY cm.created_at DESC
LIMIT 50;
```

## Step 2: Generate Snippets

Using the tournament context above, generate **exactly 60 snippets** — 15 per pundit. Each pundit has a distinct personality:

### Gary Neverill (key: `neverill`) — "The Analyst"
- Overthinks everything, turns everything into tactical breakdowns
- Gets wound up mid-sentence, stutters when passionate
- Blames "the structure" for everything
- References things he "said weeks ago" even when he didn't
- Catchphrases: "It's CRIMINAL", "Where's the structure?", "I said this three weeks ago", "The STANDARDS have dropped"
- Uses CAPITALS for emphasis

### Ian Bright (key: `bright`) — "The Enthusiast"
- Pure infectious enthusiasm, LOVES everything about football
- Gets upset about boring football
- Laughs at own jokes before finishing them
- Calls everyone by affectionate nicknames
- Catchphrases: "You LOVE to see it!", "LISTEN, right...", "Oh my DAYS!", "Back in MY day..."

### Roy Meane (key: `meane`) — "The Enforcer"
- Nothing impresses him. NOTHING.
- Delivers devastating one-liners with zero warmth
- Short sharp sentences, uncomfortable silences
- Judges everything harshly
- Catchphrases: "Disgraceful", "I wouldn't have him in my house", "Shocking", "I've seen enough"

### Jamie Scaragher (key: `scaragher`) — "The Debater"
- Argues with everyone including himself
- Starts one point then pivots to argue against himself
- Gets LOUDER as point develops, uses Scouse expressions
- Catchphrases: "No but LISTEN right...", "I'll tell ya what...", "That's boss that", "People will say... and they'd be WRONG"

### Content Mix Per Pundit (15 snippets each):
- ~3 about the leaderboard (who's rising, falling, streaking)
- ~3 about player predictions (bold picks, who looks smart/foolish)
- ~3 reacting to match results
- ~2 reacting to chat messages
- ~2 about World Cup / football news
- ~2 random society observations (self-checkout machines, meal deals, parking, weather) — in character voice

### Rules:
- 1-3 sentences per snippet, punchy and sharp
- Reference specific player names from the leaderboard
- NO hashtags, NO emojis, NO markdown
- Be opinionated — pundits don't sit on the fence
- Each snippet must have a `category`: leaderboard, predictions, results, chat, news, or wildcard

## Step 3: Delete Today's Existing Snippets and Insert New Ones

First delete any existing snippets for today (idempotent re-run):

```sql
DELETE FROM pundit_snippets
WHERE tournament_id = '<TOURNAMENT_ID>'
AND generated_date = CURRENT_DATE;
```

Then insert all 60 snippets. Use this format (repeat for all 60):

```sql
INSERT INTO pundit_snippets (tournament_id, pundit_key, content, category, generated_date)
VALUES
  ('<TOURNAMENT_ID>', 'neverill', 'snippet content here', 'leaderboard', CURRENT_DATE),
  ('<TOURNAMENT_ID>', 'neverill', 'another snippet', 'predictions', CURRENT_DATE),
  -- ... all 60 rows
;
```

## Step 4: Verify and Return Result

Run a count query to verify:

```sql
SELECT pundit_key, COUNT(*) as count
FROM pundit_snippets
WHERE tournament_id = '<TOURNAMENT_ID>'
AND generated_date = CURRENT_DATE
GROUP BY pundit_key
ORDER BY pundit_key;
```

Return a JSON object with the results:

```json
{
  "success": true,
  "date": "YYYY-MM-DD",
  "tournament": "tournament name",
  "generated": {
    "neverill": 15,
    "bright": 15,
    "meane": 15,
    "scaragher": 15
  },
  "totalInserted": 60
}
```

If anything fails, return:

```json
{
  "success": false,
  "error": "description of what went wrong"
}
```
