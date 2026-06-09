# WC2026 Group-Market Betting Pipeline

Repeatable value scanner for World Cup 2026 group-stage markets. Compares a
200,000-iteration Monte Carlo model (Elo + injuries + venue conditions, with and
without market anchoring) against live prices from Betfair Exchange, Smarkets,
Matchbook, Polymarket and ~25 bookmakers via Oddschecker, then produces a
tiered, quarter-Kelly-staked recommendations card.

## Quick start (full repeat run, ~15 min)

```powershell
cd analysis\wc2026-model\betting
python run_pipeline.py
```

Outputs land in `betting/out/`:
- `analysis.json` — every qualifying bet with full numbers
- `RECOMMENDATIONS.md` / `.pdf` — the human card with TLDR

Faster variants:
- `python run_pipeline.py --offline` — re-analyze cached odds (no fetching)
- `python run_pipeline.py --skip-oc` — exchanges/Polymarket only (~1 min, no Chrome popup)
- `python run_pipeline.py --skip-model` — reuse existing 200k-sim model files

The Oddschecker step opens a visible Chrome window (Cloudflare blocks headless)
and takes ~8-10 min for all markets; it writes incrementally and reuses pages
scraped within `OC_MAX_AGE_MIN` (default 90) minutes.

## Files

| File | Purpose |
|---|---|
| `../sim.py` | The Monte Carlo model (env: `SIM_N`, `SIM_NO_MARKET`, `SIM_JOINT`) |
| `model_independent.json` | 200k sims, market-anchoring layer OFF (primary for edge detection) |
| `model_anchored.json` | 200k sims, anchoring ON (cross-check; staking uses the min of both) |
| `common.py` | Team-name normalisation, odds parsing, HTTP + cache helpers |
| `fetch_exchanges.py` | Smarkets / Betfair ERO / Matchbook / Polymarket -> `cache/exchanges.json` |
| `fetch_oddschecker.js` | Playwright headed-Chrome scrape -> `cache/oddschecker.json` |
| `references.py` | Opta + ESPN + devigged DraftKings reference probabilities (dated) |
| `analyze.py` | EV, quarter-Kelly, tiering, lays -> `out/analysis.json` |
| `build_recs.py` | Renders `out/RECOMMENDATIONS.md` + `.pdf` |
| `tests/test_core.py` | 50 unit + integration tests (`pytest -q`) |

## Methodology in one paragraph

For every runner we take `p_used = min(p_independent, p_anchored)` from the two
model variants (conservative), find the best *executable* price (bookmaker raw,
exchange commission-adjusted: Betfair 5%, Smarkets 2%, Matchbook 4%), and demand
`EV >= +5%` on *both* variants. Tier A additionally requires an independent
forecaster (Opta supercomputer or ESPN's Elo model) to clear the implied
probability by 2pp, with **no** forecaster sitting >5pp below it (disputed picks
get demoted). Stakes are quarter-Kelly on `p_used`, capped at 2% (A) / 0.75% (B)
of bankroll. Lays require the exchange lay-implied probability to exceed the
*higher* model variant by 6pp+. Niche markets (finish-2nd, forecasts, exact
order) have no external reference so are always tier B and demand 10%+ EV.

## Caveats that matter with real money

1. **Verify "To Qualify" rules before betting**: all evidence (price alignment,
   Polymarket equivalence) says these settle on *reaching the round of 32*
   (i.e. best-thirds count). If a particular book settles on top-2 only, the
   qualify backs lose most of their value. Check the market rules tab.
2. Prices move fast in the final 36h; re-run before placing anything.
3. Anonymous Betfair data is delayed ~1-60s; confirm the price on screen.
4. Soft books (Sky, PP, AK Bets, etc.) will limit winning accounts; the big
   model edges in niche markets may only be bettable in small sizes.
5. The model's biggest divergences from the market (minnow advancement) are
   partially corroborated by Opta/ESPN but could still be model error — that's
   exactly what the tier system and caps are for. Never exceed the stake card.
