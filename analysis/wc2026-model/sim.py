# WC2026 group-stage Monte Carlo model
# Ratings: World Football Elo (eloratings.net, 9 Jun 2026) + documented adjustments
# Match model: Elo diff -> expected goal difference -> independent Poisson
# 100k sims, FIFA tiebreakers (pts, GD, GF; H2H/fair-play approximated by lots)
# Best-8-of-12 thirds ranked by pts, GD, GF, lots.
import numpy as np, json, itertools, sys, os

# Env overrides (used by the betting pipeline; defaults preserve original behaviour):
#   SIM_N=200000        — number of simulations
#   SIM_NO_MARKET=1     — disable the market-anchoring layer (independent model)
#   SIM_JOINT=1         — dump per-group joint finishing-order distribution
N_SIMS = int(os.environ.get('SIM_N', '100000'))
SLOPE = 250.0          # Elo points per 1.0 expected goal difference
BASE_TOTAL = 2.45      # baseline total goals for an even match
MISMATCH_K = 0.25      # extra total goals per abs(expected GD)
rng = np.random.default_rng(20260609)

# team: (base Elo 9-Jun-2026, injury/news adjustment, note)
TEAMS = {
 'MEX': (1875, -15, 'Malagon (GK) out, Ochoa starts; Edson fitness'),
 'RSA': (1518,   0, ''),
 'KOR': (1758,   0, ''),
 'CZE': (1740,   0, ''),
 'CAN': (1788,  -5, 'Bombito out; Davies misses opener (extra per-match adj)'),
 'BIH': (1595,   0, ''),
 'QAT': (1421,   0, ''),
 'SUI': (1891,   0, 'full strength'),
 'BRA': (1991, -20, 'Rodrygo, Militao, Estevao out; Neymar doubtful'),
 'MAR': (1827,   0, 'Hakimi expected fit; new coach since March'),
 'HAI': (1548,   0, ''),
 'SCO': (1782, -10, 'Gilmour out'),
 'USA': (1726, -10, 'Cardoso, Agyemang out; Richards doubt'),
 'PAR': (1833,  -8, 'Enciso doubtful'),
 'AUS': (1777,   0, ''),
 'TUR': (1910,   0, 'Guler fit-but-monitor'),
 'GER': (1932, -10, 'Gnabry, ter Stegen out'),
 'CUW': (1434,   0, ''),
 'CIV': (1695,   0, 'form already in Elo (beat France 4 Jun)'),
 'ECU': (1938,   0, 'full strength, 19 unbeaten'),
 'NED': (1948, -30, 'Timber, de Ligt, Schouten, Simons all out'),
 'JPN': (1906, -20, 'Mitoma, Minamino out'),
 'SWE': (1712, -15, 'Kulusevski out'),
 'TUN': (1628,   0, '0-5 Belgium already in Elo'),
 'BEL': (1893, -10, 'De Bruyne/Lukaku fitness gambles'),
 'EGY': (1696,   0, 'Salah fit'),
 'IRN': (1772,   0, ''),
 'NZL': (1562,   0, ''),
 'ESP': (2157, -10, 'Yamal hamstring (expected to play), Fermin out'),
 'CPV': (1578,   0, ''),
 'KSA': (1569,   0, ''),
 'URU': (1892, -25, 'Bentancur+Gimenez doubts, Bielsa dressing-room rift, Nunez rusty'),
 'FRA': (2063,  -5, 'Ekitike, Kamara out (depth only)'),
 'SEN': (1867,   0, 'full strength, AFCON grievance motivation'),
 'IRQ': (1618,   0, ''),
 'NOR': (1914,   0, 'Haaland fit'),
 'ARG': (2114, -10, 'Messi undercooked, Paredes/Molina doubts, Balerdi out'),
 'ALG': (1760,   0, ''),
 'AUT': (1830, -15, 'Baumgartner out'),
 'JOR': (1680,   0, ''),
 'POR': (1986,   0, 'Ronaldo fit; Leao eligible'),
 'COD': (1661,   0, ''),
 'UZB': (1714,   0, ''),
 'COL': (1982,   0, 'full strength'),
 'ENG': (2021,   0, 'full strength on Tuchel terms'),
 'CRO': (1911,  -5, 'Modric minor doubt for opener'),
 'GHA': (1510, -25, 'Kudus and Salisu out'),
 'PAN': (1730,   0, ''),
}

# Market-anchoring corrections (Elo pts), applied where raw-Elo simulation diverged
# >12pp from BOTH devigged DraftKings group odds and the Opta supercomputer.
# Rationale: Elo is slow to absorb squad-quality/trajectory information that
# markets and Opta price in (and overweights CONMEBOL unbeaten runs).
MARKET_ADJ = {
 'GER': +30,   # market 74% / Opta 60% group winner vs model 43% — form peak under Nagelsmann
 'ECU': -30,   # Elo 1938 inflated by long CONMEBOL draw-heavy unbeaten run; market 16%
 'POR': +20,   # DK 61% / Opta 59% group winner vs model 42%
 'COL': -15,   # counterpart of POR correction; pundits split, market clear
 'USA': +15,   # DK 38% / Opta 32% group winner vs model 23% — Elo overweights friendly losses
 'ENG': +10,   # DK 71% / Opta 67.5% vs model 58%
 'BRA': +10,   # DK 71% / Opta 60% vs model 57%
}

GROUPS = {
 'A': ['MEX','RSA','KOR','CZE'], 'B': ['CAN','BIH','QAT','SUI'],
 'C': ['BRA','MAR','HAI','SCO'], 'D': ['USA','PAR','AUS','TUR'],
 'E': ['GER','CUW','CIV','ECU'], 'F': ['NED','JPN','SWE','TUN'],
 'G': ['BEL','EGY','IRN','NZL'], 'H': ['ESP','CPV','KSA','URU'],
 'I': ['FRA','SEN','IRQ','NOR'], 'J': ['ARG','ALG','AUT','JOR'],
 'K': ['POR','COD','UZB','COL'], 'L': ['ENG','CRO','GHA','PAN'],
}

# fixtures: (home, away, venue, {team: per-match Elo modifier}, reason)
# Modifiers: host advantage (hosts historically +167 Elo; Mexico gets altitude-amplified
# version), altitude acclimatisation, heat adaptation at hot open-air venues.
FIX = {
 'A': [('MEX','RSA','Mexico City', {'MEX':130}, 'host+altitude Azteca (tempered: Elo already embeds home record)'),
       ('KOR','CZE','Guadalajara', {}, ''),
       ('CZE','RSA','Atlanta', {}, 'roofed/AC'),
       ('MEX','KOR','Guadalajara', {'MEX':115}, 'host+altitude GDL'),
       ('CZE','MEX','Mexico City', {'MEX':130}, 'host+altitude Azteca (tempered: Elo already embeds home record)'),
       ('RSA','KOR','Monterrey', {'RSA':10}, 'heat-adapted edge')],
 'B': [('CAN','BIH','Toronto', {'CAN':75-25}, 'host; Davies out of opener'),
       ('QAT','SUI','San Francisco', {}, ''),
       ('SUI','BIH','Los Angeles', {}, ''),
       ('CAN','QAT','Vancouver', {'CAN':75}, 'host'),
       ('SUI','CAN','Vancouver', {'CAN':75}, 'host'),
       ('BIH','QAT','Seattle', {}, '')],
 'C': [('BRA','MAR','New York/NJ', {}, ''),
       ('HAI','SCO','Boston', {}, ''),
       ('SCO','MAR','Boston', {}, ''),
       ('BRA','HAI','Philadelphia', {}, ''),
       ('SCO','BRA','Miami', {'BRA':20}, 'heat/humidity 6pm local, open-air'),
       ('MAR','HAI','Atlanta', {}, 'roofed/AC')],
 'D': [('USA','PAR','Los Angeles', {'USA':110,'PAR':-10}, 'host; Enciso doubtful opener'),
       ('AUS','TUR','Vancouver', {}, ''),
       ('USA','AUS','Seattle', {'USA':110}, 'host'),
       ('TUR','PAR','San Francisco', {}, ''),
       ('TUR','USA','Los Angeles', {'USA':110}, 'host'),
       ('PAR','AUS','San Francisco', {}, '')],
 'E': [('GER','CUW','Houston', {}, 'roofed/AC'),
       ('CIV','ECU','Philadelphia', {}, ''),
       ('GER','CIV','Toronto', {}, ''),
       ('ECU','CUW','Kansas City', {}, 'evening kickoff'),
       ('CUW','CIV','Philadelphia', {}, ''),
       ('ECU','GER','New York/NJ', {}, '')],
 'F': [('NED','JPN','Dallas', {}, 'roofed/AC'),
       ('SWE','TUN','Monterrey', {'TUN':20}, 'heat-adapted vs N.European, 8pm local 30C+'),
       ('TUN','JPN','Monterrey', {'TUN':15}, 'heat-adapted edge'),
       ('NED','SWE','Houston', {}, 'roofed/AC'),
       ('JPN','SWE','Dallas', {}, 'roofed/AC'),
       ('TUN','NED','Kansas City', {}, 'evening kickoff')],
 'G': [('BEL','EGY','Seattle', {}, ''),
       ('IRN','NZL','Los Angeles', {}, ''),
       ('BEL','IRN','Los Angeles', {}, ''),
       ('NZL','EGY','Vancouver', {}, ''),
       ('EGY','IRN','Seattle', {}, ''),
       ('NZL','BEL','Vancouver', {}, '')],
 'H': [('ESP','CPV','Atlanta', {}, 'roofed/AC'),
       ('KSA','URU','Miami', {'KSA':10}, 'heat 6pm local open-air'),
       ('ESP','KSA','Atlanta', {}, 'roofed/AC'),
       ('URU','CPV','Miami', {'CPV':10}, 'heat 6pm local open-air'),
       ('CPV','KSA','Houston', {}, 'roofed/AC'),
       ('URU','ESP','Guadalajara', {'URU':15}, 'CONMEBOL altitude familiarity 1566m')],
 'I': [('FRA','SEN','New York/NJ', {}, ''),
       ('IRQ','NOR','Boston', {}, ''),
       ('FRA','IRQ','Philadelphia', {'IRQ':10}, 'heat-adapted, 5pm local open-air'),
       ('NOR','SEN','Philadelphia', {'SEN':10}, 'heat-adapted edge'),
       ('NOR','FRA','Boston', {}, ''),
       ('SEN','IRQ','Toronto', {}, '')],
 'J': [('ARG','ALG','Kansas City', {}, 'evening kickoff'),
       ('AUT','JOR','San Francisco', {}, ''),
       ('ARG','AUT','Dallas', {}, 'roofed/AC'),
       ('JOR','ALG','San Francisco', {}, ''),
       ('JOR','ARG','Dallas', {}, 'roofed/AC'),
       ('ALG','AUT','Kansas City', {}, 'evening kickoff')],
 'K': [('POR','COD','Houston', {}, 'roofed/AC'),
       ('UZB','COL','Mexico City', {'COL':50}, 'Bogota-style altitude familiarity 2240m'),
       ('POR','UZB','Houston', {}, 'roofed/AC'),
       ('COL','COD','Guadalajara', {'COL':40}, 'altitude familiarity 1566m'),
       ('COL','POR','Miami', {'COL':10}, 'heat/humidity 7.30pm local open-air'),
       ('COD','UZB','Atlanta', {}, 'roofed/AC')],
 'L': [('ENG','CRO','Dallas', {}, 'roofed/AC'),
       ('GHA','PAN','Toronto', {}, ''),
       ('ENG','GHA','Boston', {}, ''),
       ('PAN','CRO','Toronto', {}, ''),
       ('PAN','ENG','New York/NJ', {'PAN':10}, 'heat 5pm local open-air'),
       ('CRO','GHA','Philadelphia', {'GHA':10}, 'heat-adapted, 5pm local open-air')],
}

def rating(code):
    mkt = 0 if os.environ.get('SIM_NO_MARKET') else MARKET_ADJ.get(code, 0)
    return TEAMS[code][0] + TEAMS[code][1] + mkt

def lambdas(home, away, mods):
    d = (rating(home) + mods.get(home, 0)) - (rating(away) + mods.get(away, 0))
    mu_gd = d / SLOPE
    total = BASE_TOTAL + MISMATCH_K * abs(mu_gd)
    lh = max(0.15, (total + mu_gd) / 2)
    la = max(0.15, (total - mu_gd) / 2)
    return lh, la

# ---- simulate ----
pos = {}          # code -> array (N,) position 1..4
stat3 = {}        # group -> (third_code_idx array, pts, gd, gf of third)
results = {}
total_goals = np.zeros(N_SIMS)
group_goals_mean = {}

JOINT_OUT = {}
third_scores = np.zeros((12, N_SIMS))
third_team_idx = np.zeros((12, N_SIMS), dtype=np.int8)
group_list = list(GROUPS)

match_table = []  # for report: per-fixture lambdas
for gi, g in enumerate(group_list):
    teams = GROUPS[g]
    idx = {c: k for k, c in enumerate(teams)}
    pts = np.zeros((4, N_SIMS)); gd = np.zeros((4, N_SIMS)); gf = np.zeros((4, N_SIMS))
    ggoals = np.zeros(N_SIMS)
    for (h, a, venue, mods, why) in FIX[g]:
        lh, la = lambdas(h, a, mods)
        gh = rng.poisson(lh, N_SIMS); ga = rng.poisson(la, N_SIMS)
        hw = gh > ga; aw = ga > gh; dr = gh == ga
        pts[idx[h]] += 3 * hw + dr; pts[idx[a]] += 3 * aw + dr
        gd[idx[h]] += gh - ga; gd[idx[a]] += ga - gh
        gf[idx[h]] += gh; gf[idx[a]] += ga
        ggoals += gh + ga
        match_table.append({'group': g, 'home': h, 'away': a, 'venue': venue,
                            'lam_h': round(lh, 2), 'lam_a': round(la, 2),
                            'p_h': float(np.mean(hw)), 'p_d': float(np.mean(dr)),
                            'p_a': float(np.mean(aw)), 'mods': mods, 'why': why})
    total_goals += ggoals
    group_goals_mean[g] = float(ggoals.mean())
    score = pts * 1e6 + gd * 1e3 + gf * 10 + rng.random((4, N_SIMS)) * 5
    order = np.argsort(-score, axis=0)          # order[r, s] = team idx at rank r
    for k, c in enumerate(teams):
        p = np.empty(N_SIMS, dtype=np.int8)
        for r in range(4):
            p[order[r] == k] = r + 1
        pos[c] = p
    if os.environ.get('SIM_JOINT'):
        # joint finishing-order distribution: encode top-3 ranks base-4 (4th implied)
        code4 = (order[0] * 16 + order[1] * 4 + order[2]).astype(np.int64)
        counts = np.bincount(code4, minlength=64)
        joint = {}
        for c4 in np.nonzero(counts)[0]:
            i0, i1, i2 = c4 // 16, (c4 // 4) % 4, c4 % 4
            i3 = 6 - i0 - i1 - i2
            key = '-'.join(teams[i] for i in (i0, i1, i2, i3))
            joint[key] = counts[c4] / N_SIMS
        JOINT_OUT[g] = joint

    t3 = order[2]                                # third-placed team idx per sim
    third_team_idx[gi] = t3
    cols = np.arange(N_SIMS)
    third_scores[gi] = pts[t3, cols] * 1e6 + gd[t3, cols] * 1e3 + gf[t3, cols] * 10 \
                       + rng.random(N_SIMS) * 5

# best-8 thirds across the 12 groups
rank_of_group = np.argsort(np.argsort(-third_scores, axis=0), axis=0)  # 0 = best third
third_qualifies = rank_of_group < 8            # (12, N)

P = {}
for gi, g in enumerate(group_list):
    teams = GROUPS[g]
    for k, c in enumerate(teams):
        p1 = float(np.mean(pos[c] == 1)); p2 = float(np.mean(pos[c] == 2))
        p3 = float(np.mean(pos[c] == 3)); p4 = float(np.mean(pos[c] == 4))
        is3 = (third_team_idx[gi] == k)
        p3q = float(np.mean(is3 & third_qualifies[gi]))
        P[c] = {'group': g, 'p1': p1, 'p2': p2, 'p3': p3, 'p4': p4,
                'p3q': p3q, 'pq': p1 + p2 + p3q,
                'elo_adj': rating(c), 'elo_base': TEAMS[c][0], 'inj': TEAMS[c][1],
                'note': TEAMS[c][2]}

# ---- pick optimisation: max expected game points per group ----
picks = {}
for g, teams in GROUPS.items():
    best = []
    for (t1, t2, t3) in itertools.permutations(teams, 3):
        ev = (P[t1]['pq'] + P[t1]['p1']) + (P[t2]['pq'] + P[t2]['p2']) \
             + (P[t3]['pq'] + P[t3]['p3q'])
        best.append({'pick': [t1, t2, t3], 'ev': round(ev, 4)})
    best.sort(key=lambda x: -x['ev'])
    picks[g] = best[:5]

# ---- 8-of-12 third-pick constraint ----
# The game only allows a predicted_3rd in third_place_qualifiers_count (=8) of the
# 12 groups; the rest submit null (scorer skips nulls). Optimal strategy: in every
# group take the best 1st/2nd pair; spend the 8 third-slots on the groups with the
# highest marginal EV (best full-perm EV minus best 1st/2nd-only EV).
slot3 = {}
for g, teams in GROUPS.items():
    pair_evs = sorted(
        (((P[a]['pq'] + P[a]['p1']) + (P[b]['pq'] + P[b]['p2']), (a, b))
         for a, b in itertools.permutations(teams, 2)), reverse=True)
    ev2_best, best_pair = pair_evs[0]
    ev3_best = picks[g][0]['ev']
    slot3[g] = {'ev2_best': round(ev2_best, 4), 'ev3_best': ev3_best,
                'best_pair': list(best_pair),
                'marginal': round(ev3_best - ev2_best, 4)}
chosen_groups = sorted(sorted(slot3), key=lambda g: -slot3[g]['marginal'])[:8]
final_picks = {}
for g in GROUPS:
    p = picks[g][0]['pick']
    if g in chosen_groups:
        final_picks[g] = {'pick': p, 'third': p[2], 'ev': picks[g][0]['ev']}
    else:
        a, b = slot3[g]['best_pair']
        final_picks[g] = {'pick': [a, b, None], 'third': None,
                          'ev': slot3[g]['ev2_best']}
total_ev_constrained = sum(v['ev'] for v in final_picks.values())

# ---- tiebreaker ----
tb = {'mean': float(total_goals.mean()), 'median': float(np.median(total_goals)),
      'p10': float(np.percentile(total_goals, 10)), 'p90': float(np.percentile(total_goals, 90)),
      'per_match': float(total_goals.mean() / 72)}

# ---- validation references ----
DK = {  # group-winner odds (American), DraftKings 5 Jun 2026
 'A': {'MEX': -125, 'CZE': 350, 'KOR': 650, 'RSA': 1200},
 'B': {'SUI': -135, 'CAN': 450, 'BIH': 850, 'QAT': 3000},
 'C': {'BRA': -350, 'MAR': 400, 'SCO': 800, 'HAI': 12000},
 'D': {'USA': 140, 'TUR': 175, 'PAR': 400, 'AUS': 800},
 'E': {'GER': -250, 'ECU': 550, 'CIV': 1000, 'CUW': 12000},
 'F': {'NED': -125, 'JPN': 275, 'SWE': 650, 'TUN': 1200},
 'G': {'BEL': -220, 'IRN': 650, 'EGY': 900, 'NZL': 2000},
 'H': {'ESP': -475, 'URU': 400, 'KSA': 3000, 'CPV': 6000},
 'I': {'FRA': -215, 'NOR': 275, 'SEN': 600, 'IRQ': 8000},
 'J': {'ARG': -265, 'AUT': 700, 'ALG': 800, 'JOR': 5000},
 'K': {'POR': -200, 'COL': 200, 'COD': 1400, 'UZB': 3500},
 'L': {'ENG': -280, 'CRO': 400, 'GHA': 1100, 'PAN': 4000},
}
OPTA_WIN = {'MEX': 48.0, 'SUI': 42.1, 'BRA': 60.2, 'USA': 32.4, 'GER': 59.9, 'NED': 48.2,
            'BEL': 51.9, 'ESP': 75.6, 'FRA': 60.3, 'ARG': 72.0, 'POR': 59.0, 'ENG': 67.5}
OPTA_ADV = {'MEX': 87.2, 'KOR': 70.1, 'CZE': 64.2, 'RSA': 48.9, 'SUI': 85.4, 'CAN': 79.8,
            'BIH': 62.6, 'QAT': 43.5, 'BRA': 96.9, 'MAR': 88.7, 'SCO': 65.6, 'HAI': 15.8,
            'USA': 77.0, 'TUR': 73.0, 'PAR': 64.3, 'AUS': 58.8, 'GER': 96.1, 'ECU': 86.9,
            'CIV': 64.2, 'CUW': 19.0, 'NED': 88.2, 'JPN': 76.2, 'SWE': 62.6, 'TUN': 43.4,
            'BEL': 89.6, 'EGY': 68.2, 'IRN': 64.3, 'NZL': 47.8, 'ESP': 98.5, 'URU': 84.3,
            'KSA': 39.9, 'CPV': 32.9, 'FRA': 95.3, 'NOR': 82.3, 'SEN': 62.0, 'IRQ': 27.1,
            'ARG': 96.7, 'AUT': 67.4, 'ALG': 57.1, 'JOR': 40.9, 'POR': 94.9, 'COL': 84.9,
            'COD': 22.1, 'UZB': 22.1, 'ENG': 93.0, 'CRO': 76.9, 'GHA': 49.5, 'PAN': 40.0}

def amer_to_prob(o):
    return (-o) / (-o + 100) if o < 0 else 100 / (o + 100)

validation = {}
for g, odds in DK.items():
    raw = {c: amer_to_prob(o) for c, o in odds.items()}
    s = sum(raw.values())
    for c in odds:
        validation[c] = {'dk_win': raw[c] / s, 'model_win': P[c]['p1'],
                         'opta_win': OPTA_WIN.get(c), 'model_adv': P[c]['pq'],
                         'opta_adv': OPTA_ADV.get(c)}

out = {'params': {'n_sims': N_SIMS, 'slope': SLOPE, 'base_total': BASE_TOTAL,
                  'mismatch_k': MISMATCH_K},
       'teams': P, 'picks': picks, 'tiebreaker': tb, 'matches': match_table,
       'validation': validation, 'group_goals_mean': group_goals_mean,
       'slot3': slot3, 'chosen_groups': chosen_groups, 'final_picks': final_picks,
       'total_ev_constrained': round(total_ev_constrained, 3)}
if JOINT_OUT:
    out['joint'] = JOINT_OUT
with open(sys.argv[1] if len(sys.argv) > 1 else 'model_output.json', 'w') as f:
    json.dump(out, f, indent=1)

# console summary
print(f"total goals: mean {tb['mean']:.1f}  median {tb['median']:.0f}  "
      f"p10 {tb['p10']:.0f} p90 {tb['p90']:.0f}  ({tb['per_match']:.2f}/match)")
print('\nGROUP  PICK(1st,2nd,3rd)        EV     next-best (gap)')
for g in GROUPS:
    b = picks[g][0]; nb = picks[g][1]
    print(f"{g}: {'-'.join(b['pick']):17s} {b['ev']:.3f}  {'-'.join(nb['pick']):17s} ({b['ev']-nb['ev']:.3f})")
print('\n8-of-12 THIRD SLOTS (marginal EV of spending a 3rd pick in each group):')
for g in sorted(GROUPS, key=lambda g: -slot3[g]['marginal']):
    mark = 'PICK 3rd' if g in chosen_groups else 'skip    '
    fp = final_picks[g]['pick']
    print(f"{g}: marginal {slot3[g]['marginal']:.3f}  {mark}  -> "
          f"{fp[0]}-{fp[1]}-{fp[2] or '(none)'}")
print(f"\nconstrained total EV: {total_ev_constrained:.2f} / 64 max")
print('\nVALIDATION (win group %): model / DK devig / Opta')
for g, teams in GROUPS.items():
    row = []
    for c in teams:
        v = validation.get(c)
        if v:
            row.append(f"{c} {100*v['model_win']:.0f}/{100*v['dk_win']:.0f}/"
                       f"{v['opta_win'] if v['opta_win'] else '-'}")
    print(g, ' | '.join(row))
