"""WC2026 group-market value scanner.

Inputs : model_independent.json + model_anchored.json (200k-sim Monte Carlo),
         cache/exchanges.json, cache/oddschecker.json, references.py
Output : out/analysis.json + console summary.

Methodology (see README):
- p_used = min(independent, anchored) model probability  — conservative for staking.
- Executable odds are commission-adjusted for exchanges; bookie odds taken raw but
  the venue is recorded (soft books carry limits).
- Benchmark market prob = Betfair mid (normalised within group for winner markets).
- Tier A = both model variants +EV at the executable price AND at least one
  independent forecaster (Opta/ESPN) also clears the implied probability.
- Stakes = quarter-Kelly on p_used, capped (A: 2%, B: 0.75% of bankroll).
- Lays   = exchange lay price implies a probability far above every model + refs.
"""
import json, os, re, sys
from itertools import permutations
from common import GROUPS, GROUP_OF, norm_team, load_cache, HERE
import references as R

CFG = {
    'kelly_fraction': 0.25,
    'cap_A': 0.020, 'cap_B': 0.0075, 'min_stake': 0.0025,
    'min_edge': 0.05,            # min EV (both variants) for a back
    'ref_margin': 0.02,          # ref must clear implied prob by this to corroborate
    'commission': {'betfair': 0.05, 'smarkets': 0.02, 'matchbook': 0.04},
    'max_odds': 51.0, 'min_prob': 0.02,
    'lay_gap': 0.06,             # implied(lay) - model p must exceed this
    'stale_ratio': 1.12,         # bookie best > exchange lay * ratio -> verify flag
    'ref_conflict': 0.05,        # any ref this far BELOW implied -> demote A to B
    'max_niche_per_group': 2,    # keep only the best N niche bets per group
    'max_B_bets': 15,            # tier B card size, ranked by expected profit
    'max_total_exposure': 25.0,  # % of bankroll at risk across the whole card;
                                 # simultaneous correlated bets ≠ sequential Kelly
}
SOFT_BOOKS = {'SK', 'PP', 'AKB', 'S6', 'PUP', 'G5', 'BAH', 'BTT', 'BRS', 'QN', 'SI'}
EXCH_COLS = {'BF', 'MA'}

BASE = os.path.dirname(HERE)  # wc2026-model dir


def load_models():
    ind = json.load(open(os.path.join(BASE, 'betting', 'model_independent.json')))
    anc = json.load(open(os.path.join(BASE, 'betting', 'model_anchored.json')))
    return ind, anc


def eff(odds, venue):
    c = CFG['commission'].get(venue, 0.0)
    return 1 + (odds - 1) * (1 - c) if odds else None


def kelly(p, o):
    if not o or o <= 1:
        return 0.0
    return max(0.0, (p * o - 1) / (o - 1))


def lay_kelly(p, lay_odds, commission):
    """Kelly fraction of bankroll to risk as LIABILITY when laying at lay_odds.

    Win (1-c) per unit liability/(L-1) with prob (1-p); lose liability with prob p.
    Kelly: f* = ((1-p)*b - p) / b with b = (1-c)/(L-1), expressed on liability.
    """
    if not lay_odds or lay_odds <= 1:
        return 0.0
    b = (1 - commission) / (lay_odds - 1)
    return max(0.0, ((1 - p) * b - p) / b)


def winner_benchmark(exch):
    """Betfair mid implied, normalised to sum 1 within each group."""
    out = {}
    bf = exch.get('betfair', {}).get('group_winner', {})
    for g, runners in bf.items():
        mids = {}
        for c, q in runners.items():
            b, l = q.get('back'), q.get('lay')
            if b and l:
                mids[c] = (1 / b + 1 / l) / 2
            elif q.get('last'):
                mids[c] = 1 / q['last']
        s = sum(mids.values())
        if s > 0:
            out.update({c: m / s for c, m in mids.items()})
    return out


def qualify_benchmark(exch):
    """Betfair to-qualify mid implied (binary; no normalisation possible)."""
    out = {}
    bf = exch.get('betfair', {}).get('to_qualify', {})
    for g, runners in bf.items():
        for c, q in runners.items():
            b, l = q.get('back'), q.get('lay')
            if b and l:
                out[c] = (1 / b + 1 / l) / 2
    return out


def best_executable(code, group, market, oc, exch):
    """All executable back offers for a runner -> list of (eff_odds, raw_odds, venue, flag)."""
    offers = []
    # oddschecker bookie columns
    key = {'group_winner': 'winner', 'to_qualify': 'to-qualify'}.get(market)
    if oc and key:
        for sel in (oc.get('markets', {}).get(key, {}) or {}).get(group, []):
            if norm_team(sel['name']) != code:
                continue
            for bk, o in sel['prices'].items():
                if bk in EXCH_COLS:
                    continue
                venue = f'bookie:{bk}' + (' (soft)' if bk in SOFT_BOOKS else '')
                offers.append((o, o, venue))
    # exchanges
    for src in ('betfair', 'smarkets', 'matchbook'):
        q = exch.get(src, {}).get(market, {}).get(group, {}).get(code)
        if q and q.get('back'):
            offers.append((eff(q['back'], src), q['back'], f'exchange:{src}'))
    return sorted([o for o in offers if o[0]], reverse=True)


def evaluate_backs(ind, anc, oc, exch):
    bets = []
    wb = winner_benchmark(exch)
    qb = qualify_benchmark(exch)
    pm = exch.get('polymarket', {})
    for market, pkey in (('group_winner', 'p1'), ('to_qualify', 'pq')):
        for code in GROUP_OF:
            g = GROUP_OF[code]
            p_i = ind['teams'][code][pkey]
            p_a = anc['teams'][code][pkey]
            p = min(p_i, p_a)
            if p < CFG['min_prob']:
                continue
            offers = best_executable(code, g, market, oc, exch)
            if not offers:
                continue
            o_eff, o_raw, venue = offers[0]
            if o_raw > CFG['max_odds']:
                continue
            ev_i, ev_a = p_i * o_eff - 1, p_a * o_eff - 1
            if min(ev_i, ev_a) < CFG['min_edge']:
                continue
            implied = 1 / o_eff
            refs = {}
            if market == 'to_qualify':
                refs = {'opta': R.OPTA_ADV.get(code), 'espn': R.ESPN_ADV.get(code),
                        'polymarket': (pm.get('advance', {}).get(code) or {}).get('prob')}
                forecaster_vals = [refs['opta'], refs['espn']]
                bench = qb.get(code)
            else:
                refs = {'opta_win': R.OPTA_WIN.get(code), 'dk_devig': R.DK_WIN.get(code),
                        'polymarket': (pm.get('group_winner', {}).get(g, {}) or {})
                                      .get(code, {}).get('prob')}
                forecaster_vals = [refs['opta_win']]
                bench = wb.get(code)
            known = [v for v in forecaster_vals if v]
            corroborated = any(v >= implied + CFG['ref_margin'] for v in known)
            conflicted = any(v < implied - CFG['ref_conflict'] for v in known)
            tier = 'A' if corroborated and not conflicted else 'B'
            cap = CFG['cap_A'] if tier == 'A' else CFG['cap_B']
            stake = min(cap, CFG['kelly_fraction'] * kelly(p, o_eff))
            flags = []
            if corroborated and conflicted:
                flags.append('forecasters disagree (one ref well below implied) — demoted to B')
            bf_lay = (exch.get('betfair', {}).get(market, {}).get(g, {})
                      .get(code, {}) or {}).get('lay')
            if bf_lay and o_raw > bf_lay * CFG['stale_ratio'] and venue.startswith('bookie'):
                flags.append('price >> exchange lay — verify it still stands before betting')
            if 'soft' in venue:
                flags.append('soft bookmaker — expect stake limits')
            if stake < CFG['min_stake']:
                continue
            bets.append({
                'bet': 'BACK', 'market': market, 'group': g, 'team': code,
                'venue': venue, 'odds': o_raw, 'eff_odds': round(o_eff, 3),
                'p_independent': round(p_i, 4), 'p_anchored': round(p_a, 4),
                'p_used': round(p, 4), 'implied': round(implied, 4),
                'ev_independent': round(ev_i, 4), 'ev_anchored': round(ev_a, 4),
                'benchmark_exchange_mid': round(bench, 4) if bench else None,
                'refs': {k: (round(v, 3) if v else None) for k, v in refs.items()},
                'tier': tier, 'stake_pct': round(stake * 100, 2), 'flags': flags,
                'alt_offers': [(round(e, 2), r, v) for e, r, v in offers[1:4]],
            })
    return bets


def evaluate_lays(ind, anc, exch):
    bets = []
    pm = exch.get('polymarket', {})
    for market, pkey in (('group_winner', 'p1'), ('to_qualify', 'pq')):
        for code in GROUP_OF:
            g = GROUP_OF[code]
            p_i = ind['teams'][code][pkey]
            p_a = anc['teams'][code][pkey]
            p_max = max(p_i, p_a)
            # best (lowest) lay across exchanges
            lays = []
            for src in ('betfair', 'smarkets', 'matchbook'):
                q = exch.get(src, {}).get(market, {}).get(g, {}).get(code)
                if q and q.get('lay'):
                    lays.append((q['lay'], src))
            if not lays:
                continue
            L, src = min(lays)
            implied = 1 / L
            if implied - p_max < CFG['lay_gap']:
                continue
            if market == 'to_qualify':
                refvals = [R.OPTA_ADV.get(code), R.ESPN_ADV.get(code)]
            else:
                refvals = [R.OPTA_WIN.get(code), R.DK_WIN.get(code)]
            known = [v for v in refvals if v]
            corroborated = bool(known) and all(v <= implied - CFG['ref_margin'] for v in known)
            tier = 'A' if corroborated else 'B'
            c = CFG['commission'][src]
            b = (1 - c) / (L - 1)                       # win/liability ratio
            cap = CFG['cap_A'] if tier == 'A' else CFG['cap_B']
            liab = min(cap, CFG['kelly_fraction'] * lay_kelly(p_max, L, c))
            if liab < CFG['min_stake']:
                continue
            ev_per_liab = (1 - p_max) * b - p_max
            bets.append({
                'bet': 'LAY', 'market': market, 'group': g, 'team': code,
                'venue': f'exchange:{src}', 'lay_odds': L,
                'implied': round(implied, 4), 'p_independent': round(p_i, 4),
                'p_anchored': round(p_a, 4), 'p_used_max': round(p_max, 4),
                'ev_per_liability': round(ev_per_liab, 4),
                'refs': {'vals': [round(v, 3) for v in known]},
                'tier': tier, 'liability_pct': round(liab * 100, 2), 'flags': [],
            })
    return bets


_SPLIT = re.compile(r'\s*[/,;-]\s*| - ')


def parse_multi(name, group):
    """Parse forecast/exact-order selection names into ordered team codes."""
    name = re.sub(r'\b[1-4](st|nd|rd|th)\b\.?', ' ', name)
    parts = [p for p in _SPLIT.split(name) if p.strip()]
    codes = [norm_team(p) for p in parts]
    codes = [c for c in codes if c]
    if codes and all(GROUP_OF.get(c) == group for c in codes):
        return codes
    return None


def evaluate_niche(ind, anc, oc):
    """finish-2nd / straight-forecast / exact-order — Sky/PP territory, tier B only."""
    bets = []
    if not oc:
        return bets
    jt_i, jt_a = ind.get('joint', {}), anc.get('joint', {})

    def joint_p(jt, g, pred):
        return sum(p for k, p in jt.get(g, {}).items() if pred(k.split('-')))

    markets = oc.get('markets', {})
    specs = [
        ('to-finish-2nd', lambda codes: (lambda order: order[1] == codes[0]), 1),
        ('straight-forecast', lambda codes: (lambda order: order[:2] == codes), 2),
        ('group-exact-finish-order', lambda codes: (lambda order: order == codes), 4),
    ]
    for mkt, make_pred, n_codes in specs:
        for g, sels in (markets.get(mkt, {}) or {}).items():
            for sel in sels:
                codes = parse_multi(sel['name'], g)
                if mkt == 'to-finish-2nd':
                    c = norm_team(sel['name'])
                    codes = [c] if c else None
                if not codes or len(codes) < n_codes:
                    continue
                pred = make_pred(codes)
                p_i = joint_p(jt_i, g, pred)
                p_a = joint_p(jt_a, g, pred)
                p = min(p_i, p_a)
                books = {bk: o for bk, o in sel['prices'].items() if bk not in EXCH_COLS}
                if not books or p < 0.005:
                    continue
                bk, o = max(books.items(), key=lambda kv: kv[1])
                if o > 101:
                    continue
                ev_i, ev_a = p_i * o - 1, p_a * o - 1
                if min(ev_i, ev_a) < CFG['min_edge'] * 2:   # demand more edge: MC noise + no refs
                    continue
                stake = min(CFG['cap_B'], CFG['kelly_fraction'] * kelly(p, o))
                if stake < CFG['min_stake']:
                    continue
                bets.append({
                    'bet': 'BACK', 'market': mkt, 'group': g,
                    'selection': sel['name'], 'codes': codes,
                    'venue': f'bookie:{bk}' + (' (soft)' if bk in SOFT_BOOKS else ''),
                    'odds': o, 'p_independent': round(p_i, 4), 'p_anchored': round(p_a, 4),
                    'p_used': round(p, 4), 'implied': round(1 / o, 4),
                    'ev_independent': round(ev_i, 4), 'ev_anchored': round(ev_a, 4),
                    'tier': 'B', 'stake_pct': round(stake * 100, 2),
                    'flags': ['niche market: no external reference model exists; '
                              'model-only edge', 'soft bookmaker — expect stake limits'],
                })
    return bets


def main():
    ind, anc = load_models()
    exch = (load_cache('exchanges.json') or {}).get('sources', {})
    oc = load_cache('oddschecker.json')
    if not exch:
        print('WARNING: no exchange cache — run fetch_exchanges.py', file=sys.stderr)
    if not oc:
        print('WARNING: no oddschecker cache — niche/bookie prices unavailable', file=sys.stderr)
    backs = evaluate_backs(ind, anc, oc, exch)
    lays = evaluate_lays(ind, anc, exch)
    niche = evaluate_niche(ind, anc, oc)

    def eprofit(b):
        size = b.get('stake_pct') or b.get('liability_pct', 0)
        edge = min(b.get('ev_independent', 0), b.get('ev_anchored', 0)) \
            if b['bet'] == 'BACK' else b.get('ev_per_liability', 0)
        return size * edge

    # portfolio discipline: best 2 niche bets per group, then cap tier B card size
    from collections import defaultdict
    per_group = defaultdict(list)
    for b in sorted(niche, key=eprofit, reverse=True):
        per_group[b['group']].append(b)
    niche_kept = [b for g, lst in per_group.items()
                  for b in lst[:CFG['max_niche_per_group']]]
    n_dropped_niche = len(niche) - len(niche_kept)

    tier_a = [b for b in backs + lays if b['tier'] == 'A']
    tier_b_pool = [b for b in backs + lays if b['tier'] == 'B'] + niche_kept
    tier_b = sorted(tier_b_pool, key=eprofit, reverse=True)[:CFG['max_B_bets']]
    n_dropped_b = len(tier_b_pool) - len(tier_b)

    allbets = sorted(tier_a + tier_b,
                     key=lambda b: (b['tier'], -(b.get('stake_pct') or b.get('liability_pct', 0))))

    # portfolio cap: scale all stakes if total at-risk exceeds the ceiling
    total = sum(b.get('stake_pct') or b.get('liability_pct', 0) for b in allbets)
    scale = 1.0
    if total > CFG['max_total_exposure']:
        scale = CFG['max_total_exposure'] / total
        for b in allbets:
            k = 'stake_pct' if 'stake_pct' in b else 'liability_pct'
            b[k] = round(b[k] * scale, 2)
    os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
    meta = {
        'config': CFG, 'n_bets': len(allbets),
        'dropped': {'niche_per_group_cap': n_dropped_niche, 'tier_b_card_cap': n_dropped_b},
        'exposure_scale': round(scale, 3), 'raw_exposure_pct': round(total, 1),
        'exchange_fetched_at': (load_cache('exchanges.json') or {}).get('fetched_at'),
        'oddschecker_fetched_at': (oc or {}).get('fetched_at'),
        'model_sims': ind['params']['n_sims'],
    }
    with open(os.path.join(HERE, 'out', 'analysis.json'), 'w') as f:
        json.dump({'meta': meta, 'bets': allbets}, f, indent=1)
    print(f'{len(allbets)} qualifying bets ({sum(1 for b in allbets if b["tier"] == "A")} tier A)')
    for b in allbets:
        size = b.get('stake_pct') or b.get('liability_pct')
        name = b.get('team') or b.get('selection')
        odds = b.get('odds') or b.get('lay_odds')
        print(f"[{b['tier']}] {b['bet']:4s} {b['market']:24s} {b['group']} {name:28s} "
              f"@{odds:<7} {b['venue']:22s} stake/liab {size}%")


if __name__ == '__main__':
    main()
