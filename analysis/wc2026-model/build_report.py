# Build report.html from model_output.json + sensitivity.json
import json

o = json.load(open('model_output.json'))
sens = json.load(open('sensitivity.json'))
P, picks, tb = o['teams'], o['picks'], o['tiebreaker']
FINAL, SLOT3, CHOSEN = o['final_picks'], o['slot3'], set(o['chosen_groups'])
TOTAL_EV = o['total_ev_constrained']

NAME = {
 'MEX': ('Mexico', '🇲🇽'), 'RSA': ('South Africa', '🇿🇦'), 'KOR': ('South Korea', '🇰🇷'),
 'CZE': ('Czechia', '🇨🇿'), 'CAN': ('Canada', '🇨🇦'), 'BIH': ('Bosnia & Herz.', '🇧🇦'),
 'QAT': ('Qatar', '🇶🇦'), 'SUI': ('Switzerland', '🇨🇭'), 'BRA': ('Brazil', '🇧🇷'),
 'MAR': ('Morocco', '🇲🇦'), 'HAI': ('Haiti', '🇭🇹'), 'SCO': ('Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿'),
 'USA': ('USA', '🇺🇸'), 'PAR': ('Paraguay', '🇵🇾'), 'AUS': ('Australia', '🇦🇺'),
 'TUR': ('Türkiye', '🇹🇷'), 'GER': ('Germany', '🇩🇪'), 'CUW': ('Curaçao', '🇨🇼'),
 'CIV': ('Ivory Coast', '🇨🇮'), 'ECU': ('Ecuador', '🇪🇨'), 'NED': ('Netherlands', '🇳🇱'),
 'JPN': ('Japan', '🇯🇵'), 'SWE': ('Sweden', '🇸🇪'), 'TUN': ('Tunisia', '🇹🇳'),
 'BEL': ('Belgium', '🇧🇪'), 'EGY': ('Egypt', '🇪🇬'), 'IRN': ('Iran', '🇮🇷'),
 'NZL': ('New Zealand', '🇳🇿'), 'ESP': ('Spain', '🇪🇸'), 'CPV': ('Cape Verde', '🇨🇻'),
 'KSA': ('Saudi Arabia', '🇸🇦'), 'URU': ('Uruguay', '🇺🇾'), 'FRA': ('France', '🇫🇷'),
 'SEN': ('Senegal', '🇸🇳'), 'IRQ': ('Iraq', '🇮🇶'), 'NOR': ('Norway', '🇳🇴'),
 'ARG': ('Argentina', '🇦🇷'), 'ALG': ('Algeria', '🇩🇿'), 'AUT': ('Austria', '🇦🇹'),
 'JOR': ('Jordan', '🇯🇴'), 'POR': ('Portugal', '🇵🇹'), 'COD': ('DR Congo', '🇨🇩'),
 'UZB': ('Uzbekistan', '🇺🇿'), 'COL': ('Colombia', '🇨🇴'), 'ENG': ('England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿'),
 'CRO': ('Croatia', '🇭🇷'), 'GHA': ('Ghana', '🇬🇭'), 'PAN': ('Panama', '🇵🇦'),
}
def nm(c): return f"{NAME[c][1]} {NAME[c][0]}"

NARRATIVE = {
 'A': """Mexico are the tournament's biggest conditions beneficiary: two matches at the
   Estadio Azteca (2,240&nbsp;m — Mexico have never lost a World Cup finals match there) and one in
   Guadalajara, with World Cup hosts historically outperforming their rating by ~167 Elo points.
   The loss of first-choice keeper Malagón (Ochoa, 40, starts) is priced in. The real decision is
   2nd vs 3rd: <b>South Korea vs Czechia is a near coin-flip</b> (EV gap 0.04). The model and Opta
   both lean Korea (Son fit, unbeaten qualifying); bookmakers lean the battle-hardened Czechs.
   South Africa — the weakest African qualifier — are a distant fourth.""",
 'B': """Switzerland edge a two-horse race: full strength, an elite qualifying defence (14-2),
   and the bookmakers' clear favourite, against a Canada side with genuine home support in
   Toronto/Vancouver but Alphonso Davies missing the opener and a discipline problem (three
   straight matches with a red card). The model has them closer than the market does, and
   either order of the top two scores well — but Switzerland 1st is the higher-EV branch.
   Bosnia 3rd is one of the clearest third-place picks on the board (47% to finish exactly 3rd).""",
 'C': """Brazil's squad is weakened (Rodrygo, Militão and Estêvão out; Neymar doubtful for the
   opener) but Ancelotti's side enter on three straight wins and remain ~150 Elo clear of
   Morocco, whose perfect 8-0-0 qualifying is offset by a mid-cycle coaching change after the
   AFCON final controversy. Scotland — first World Cup since 1998, 8 goals in two June
   friendlies — take 3rd comfortably over debutants Haiti, with a 70% chance of advancing.""",
 'D': """The chaos group: the lowest expected points of all twelve (EV 3.01) — treat anything
   here as fragile. The model makes <b>Türkiye</b> top: 13th in the world on Elo, a golden
   generation (Güler, Yıldız, Çalhanoğlu), four straight wins. The market narrowly prefers the
   USA, but the hosts' Elo (38th) reflects a genuinely poor 2026 — 11 goals conceded in four
   spring games — and even with home advantage and a market correction they project 2nd.
   Paraguay over Australia for 3rd is nearly a coin-flip (EV gap 0.02); Paraguay's elite
   qualifying defence wins the tiebreak — and this group takes the eighth and final
   third-place slot, narrowly ahead of Algeria in Group J.""",
 'E': """The model's raw Elo actually rated Ecuador (19 matches unbeaten) above Germany, but
   the market-anchoring layer corrects for Elo's known overrating of CONMEBOL draw-streaks:
   Germany enter on four straight wins in their best form of the Nagelsmann era, and both Opta
   (60%) and the bookmakers (74%) make them clear group favourites. Ivory Coast 3rd is the
   single most confident third-place pick in the tournament (49% to finish exactly 3rd):
   they conceded zero goals in qualifying and just beat France.""",
 'F': """Group F is closer than the seedings suggest. The Netherlands' spine has been gutted
   (Timber, de Ligt, Schouten and Simons all out) and they lost to Algeria this month, while
   Japan — who beat Scotland and England away in March — are missing Mitoma and Minamino.
   The model keeps the Dutch narrowly top (ESPN's model picks Japan; either order is
   defensible). <b>No third pick is spent here:</b> Sweden would be the candidate, but only 65%
   of their 3rd-place finishes survive the best-8 cut — fourth-worst marginal EV on the card.""",
 'G': """Belgium are the form team of 2026 — 12 goals in their last three, including 5-0 over
   Tunisia — and win the group in over half of simulations despite the De Bruyne/Lukaku fitness
   gambles. The 2nd/3rd order is contested: the model takes <b>Iran</b> (76 Elo points above
   Egypt, experienced core, targeting a first-ever knockout berth) with Egypt 3rd; bookmakers
   prefer Salah's Egypt. Both advance in most simulations, which is what the scoring rewards.""",
 'H': """Spain are the strongest team in the tournament (99.3% to advance, 79% to win the
   group) even with Yamal managing a hamstring. Uruguay 2nd despite the noise — Bentancur and
   Giménez doubtful, a reported dressing-room rift with Bielsa — because the gap to the rest is
   so large. <b>This is the easiest group to skip for a third pick</b>: Cape Verde vs Saudi
   Arabia is a pure coin-flip and barely half of either side's 3rd-place finishes survive the
   best-8 cut — the worst marginal EV (0.53) of all twelve groups.""",
 'I': """France cruise. Norway 2nd over Senegal is the call the whole evidence stack agrees on
   (model, Opta, bookmakers): a perfect 8-0-0 qualifying with 37 goals and a fit Haaland,
   against Africa's best squad carrying an AFCON grievance to CAS. Senegal 3rd still advances
   in 74% of simulations — this is the strongest predicted third-place team in the field.
   Iraq, the heat-hardened ICPO survivor, held Spain 1-1 last week but lack the quality.""",
 'J': """Argentina's group is serene: 72.5% to top it even with Messi undercooked (hamstring,
   managed minutes) and Paredes/Molina doubts. Austria 2nd over Algeria mirrors Opta: Rangnick's
   press machine has won three straight, though Baumgartner's loss hurts. Algeria — who beat the
   Netherlands this month — were the closest miss for a third pick: their marginal EV (0.78)
   fell just below Group D's (0.86) for the eighth and final slot.""",
 'K': """The genuine toss-up at the top: Portugal and Colombia are four Elo points apart, and
   Colombia get conditions boosts (altitude familiarity at Mexico City and Guadalajara, Miami
   heat for the head-to-head). Raw Elo + conditions actually picked Colombia; the market layer
   (Portugal 61% vs 30% with bookmakers, 59% with Opta) flips it to <b>Portugal 1st</b>. Either
   way both advance in &gt;91% of sims. <b>No third pick</b>: Uzbekistan vs DR Congo is messy
   (model prefers UZB, bookmakers COD) and neither clears a 0.70 marginal — an easy skip.""",
 'L': """The highest-EV group on the card (3.83). England's 22-0 perfect qualifying makes them
   near-locks; Croatia's last dance with Modrić takes 2nd comfortably. Panama 3rd is effectively
   handed to them: Ghana have lost Kudus and Salisu, are winless in 2026, and advance in just
   16% of simulations.""",
}

CLOSE_CALLS = [
 ('8th third-slot', 'Group D (Paraguay) in, Group J (Algeria) out', '0.073',
  "The last of the eight third-place slots. Paraguay's marginal EV (0.86) edges Algeria's (0.78). The chosen eight groups were identical in all seven sensitivity variants."),
 ('A — 2nd/3rd order', 'South Korea 2nd, Czechia 3rd', '0.037',
  'Opta agrees with Korea ahead; DraftKings prefers Czechia. Both advance in ~71–74% of sims, so the order is the only risk.'),
 ('D — whole group', 'Türkiye 1st, USA 2nd, Paraguay 3rd', '0.019–0.10',
  'Lowest-EV group. Market makes USA narrow favourites; Elo strongly prefers Türkiye. Paraguay vs Australia for 3rd is a 0.02 EV coin-flip.'),
 ('K — 1st/2nd order', 'Portugal over Colombia', '0.058',
  'Raw model preferred Colombia; market anchoring flips it. Both advance in >91% of sims.'),
 ('F — 1st/2nd order', 'Netherlands over Japan', '0.107',
  'ESPN model picks Japan top. Dutch injury crisis vs Japan missing Mitoma/Minamino. Model keeps NED by 32 adjusted Elo.'),
 ('G — 2nd/3rd order', 'Iran 2nd, Egypt 3rd', '0.096',
  'Model and Elo prefer Iran; bookmakers prefer Egypt. Both advance in ~65–78% of sims.'),
]

ADJ_ROWS = [
 ('Netherlands', '-30', 'Timber, de Ligt, Schouten, Simons all ruled out — first-choice spine gone'),
 ('Ghana', '-25', 'Kudus and Salisu out (long-term)'),
 ('Uruguay', '-25', 'Bentancur + Giménez doubts; reported Bielsa dressing-room rift; Núñez rusty'),
 ('Brazil', '-20', 'Rodrygo, Militão, Estêvão out; Neymar (calf) doubtful for opener'),
 ('Japan', '-20', 'Mitoma and Minamino out'),
 ('Mexico', '-15', 'First-choice GK Malagón out (Ochoa, 40, starts); Edson Álvarez fitness'),
 ('Sweden', '-15', 'Kulusevski out'),
 ('Austria', '-15', 'Baumgartner (form attacker, 13 league goals) out'),
 ('Argentina', '-10', 'Messi undercooked (hamstring); Paredes, Molina doubts; Balerdi out'),
 ('Spain', '-10', 'Yamal hamstring (expected to play); Fermín López out'),
 ('Germany', '-10', 'Gnabry, ter Stegen out'),
 ('Belgium', '-10', 'De Bruyne / Lukaku fitness gambles'),
 ('USA', '-10', 'Cardoso, Agyemang out; Richards doubtful'),
 ('Scotland', '-10', 'Gilmour out'),
 ('Others', '-5 to -8', 'France (depth), Croatia (Modrić opener doubt), Canada (Bombito; Davies handled per-match), Paraguay (Enciso)'),
]

MKT_ROWS = [
 ('Germany', '+30', 'Model 43% group win vs DK 74% / Opta 60% — Elo slow on Nagelsmann-era form peak'),
 ('Ecuador', '-30', 'Elo 1938 inflated by CONMEBOL draw-heavy unbeaten run; market 16%'),
 ('Portugal', '+20', 'Model 42% vs DK 61% / Opta 59%'),
 ('Colombia', '-15', 'Counterpart of Portugal correction'),
 ('USA', '+15', 'Model 23% vs DK 38% / Opta 32% — Elo overweights spring friendly losses'),
 ('England', '+10', 'Model 58% vs DK 71% / Opta 67.5%'),
 ('Brazil', '+10', 'Model 57% vs DK 71% / Opta 60%'),
]

COND_ROWS = [
 ('Host advantage', 'Mexico +130 (Azteca) / +115 (Guadalajara); USA +110; Canada +75',
  'Hosts outperform by ~+167 Elo historically (ProFootballLogic, 9 WCs). Tempered for Mexico/Canada because their Elo already embeds strong recent home results.'),
 ('Altitude', 'Colombia +50 at Mexico City (2,240 m), +40 at Guadalajara (1,566 m); Uruguay +15 at Guadalajara',
  "McSharry (BMJ 2007): ~0.5 goals of GD per 1,000 m altitude difference. Bogotá-based familiarity transfers; Mexico's own altitude edge is inside the host bonus."),
 ('Heat adaptation', '+10 to +20 for heat-adapted sides in hot open-air venues (Monterrey, Miami, NY/NJ + Philadelphia late-afternoon slots)',
  'BMJ Open SEM 2025: Dallas/Houston/Miami/Monterrey exceed 28°C WBGT on >80% of June days; research shows heat suppresses pressing intensity (hurting N. European sides) rather than total goals. Roofed/AC venues (Atlanta, Dallas, Houston) treated as neutral.'),
 ('Per-match injuries', 'Canada −25 extra for opener (Davies out); Paraguay −10 opener (Enciso)',
  'Squad news mapped to specific fixtures where a player is expected back later in the group.'),
]

SENS_LABEL = {
 'base': 'Base model (100k sims)', 'flat_slope': 'Flatter Elo→goals slope (300)',
 'steep_slope': 'Steeper slope (210)', 'low_goals': 'Low-scoring environment (2.25 base)',
 'high_goals': 'High-scoring environment (2.65 base)',
 'no_market': 'Market-anchoring layer removed', 'no_condit': 'Conditions layer removed',
}

def bar(p, color='#1a7a4f'):
    return (f'<div class="bar"><div style="width:{p*100:.0f}%;background:{color}"></div>'
            f'<span>{p*100:.0f}%</span></div>')

rows_groups = []
for g in 'ABCDEFGHIJKL':
    pick = FINAL[g]['pick']; ev = FINAL[g]['ev']; third = FINAL[g]['third']
    teams = [c for c in P if P[c]['group'] == g]
    teams.sort(key=lambda c: -(P[c]['p1']*4 + P[c]['p2']*3 + P[c]['p3']*2))
    trs = ''
    for c in teams:
        t = P[c]
        slot = ''
        if c == pick[0]: slot = '<span class="chip c1">1st</span>'
        elif c == pick[1]: slot = '<span class="chip c2">2nd</span>'
        elif third and c == third: slot = '<span class="chip c3">3rd</span>'
        trs += (f'<tr><td class="tn">{nm(c)} {slot}</td>'
                f'<td>{t["p1"]*100:.0f}%</td><td>{t["p2"]*100:.0f}%</td>'
                f'<td>{t["p3"]*100:.0f}%</td><td>{t["p3q"]*100:.0f}%</td>'
                f'<td class="q">{bar(t["pq"])}</td></tr>')
    third_str = nm(third) if third else '<span class="muted">no 3rd pick</span>'
    rows_groups.append(f"""
    <div class="group">
      <div class="ghead"><span class="gletter">Group {g}</span>
        <span class="gpick">{nm(pick[0])} &rsaquo; {nm(pick[1])} &rsaquo; {third_str}</span>
        <span class="gev">EV {ev:.2f} · 3rd-slot marginal {SLOT3[g]['marginal']:.2f}</span></div>
      <table class="probs">
        <tr><th>Team</th><th>1st</th><th>2nd</th><th>3rd</th><th>3rd&nbsp;&amp;&nbsp;qual.</th><th>Qualify</th></tr>
        {trs}
      </table>
      <p class="note">{NARRATIVE[g]}</p>
    </div>""")

summary_rows = ''
total_ev = TOTAL_EV
for g in 'ABCDEFGHIJKL':
    pick = FINAL[g]['pick']; ev = FINAL[g]['ev']; third = FINAL[g]['third']
    conf = 'High' if ev >= 3.6 else ('Medium' if ev >= 3.0 else 'Low')
    cc = {'D': 'chaos group', 'K': '1st/2nd toss-up',
          'F': 'order contested', 'A': '2nd/3rd coin-flip'}.get(g, '')
    third_cell = nm(third) if third else '<span class="muted">— (slot not used)</span>'
    summary_rows += (f'<tr><td class="gl">{g}</td><td>{nm(pick[0])}</td><td>{nm(pick[1])}</td>'
                     f'<td>{third_cell}</td><td>{ev:.2f}</td><td>{conf}{(" — "+cc) if cc else ""}</td></tr>')

cc_rows = ''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td><td>{d}</td></tr>'
                  for a, b, c, d in CLOSE_CALLS)
adj_rows = ''.join(f'<tr><td>{a}</td><td class="num">{b}</td><td>{c}</td></tr>' for a, b, c in ADJ_ROWS)
mkt_rows = ''.join(f'<tr><td>{a}</td><td class="num">{b}</td><td>{c}</td></tr>' for a, b, c in MKT_ROWS)
cond_rows = ''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in COND_ROWS)

val_rows = ''
for g in 'ABCDEFGHIJKL':
    teams = [c for c in P if P[c]['group'] == g]
    fav = max(teams, key=lambda c: P[c]['p1'])
    v = o['validation'][fav]
    opta = f"{v['opta_win']:.0f}%" if v['opta_win'] else '—'
    val_rows += (f'<tr><td class="gl">{g}</td><td>{nm(fav)}</td>'
                 f'<td>{v["model_win"]*100:.0f}%</td><td>{v["dk_win"]*100:.0f}%</td><td>{opta}</td></tr>')

sens_rows = ''
base_picks = sens['picks']['base']
for k in sens['picks']:
    devs = [f"{g}: {'-'.join(sens['picks'][k][g])}" for g in base_picks
            if sens['picks'][k][g] != base_picks[g]]
    sens_rows += (f'<tr><td>{SENS_LABEL[k]}</td><td class="num">{sens["goals"][k]}</td>'
                  f'<td>{"; ".join(devs) if devs else "All 12 picks unchanged"}</td></tr>')

third_rows = ''
for g in sorted('ABCDEFGHIJKL', key=lambda g: -SLOT3[g]['marginal']):
    c = picks[g][0]['pick'][2]   # best third-place candidate in this group
    t = P[c]
    cond = t['p3q']/t['p3'] if t['p3'] else 0
    used = g in CHOSEN
    badge = ('<span class="chip c1">PICKED</span>' if used
             else '<span class="chip" style="background:#9aa7b1">skipped</span>')
    third_rows += (f'<tr><td class="gl">{g}</td><td>{nm(c)}</td>'
                   f'<td>{t["p3"]*100:.0f}%</td><td>{t["p3q"]*100:.0f}%</td>'
                   f'<td>{cond*100:.0f}%</td><td>{t["pq"]*100:.0f}%</td>'
                   f'<td class="num">{SLOT3[g]["marginal"]:.2f}</td><td>{badge}</td></tr>')

html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 13mm 13mm 15mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font: 9.5pt/1.45 'Segoe UI', system-ui, sans-serif; color: #1c2733; }}
  .page {{ page-break-after: always; }}
  .page:last-child {{ page-break-after: auto; }}
  h1 {{ font: 700 26pt/1.15 Georgia, serif; }}
  h2 {{ font: 700 15pt/1.2 Georgia, serif; color: #0d4d31; border-bottom: 2.5px solid #0d4d31;
        padding-bottom: 4px; margin: 0 0 10px; }}
  h3 {{ font: 600 11pt/1.3 'Segoe UI'; color: #0d4d31; margin: 14px 0 5px; }}
  p {{ margin: 0 0 7px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 4px 0 10px; }}
  th {{ background: #0d4d31; color: #fff; font-size: 8pt; text-transform: uppercase;
       letter-spacing: .4px; padding: 4px 7px; text-align: left; }}
  td {{ padding: 3.5px 7px; border-bottom: 1px solid #dde5e0; font-size: 9pt; vertical-align: top; }}
  tr:nth-child(even) td {{ background: #f4f8f6; }}
  .num {{ text-align: center; font-weight: 600; white-space: nowrap; }}
  .gl {{ font-weight: 700; color: #0d4d31; }}
  .cover {{ background: linear-gradient(160deg, #0d4d31, #15683f 55%, #0a3b25);
            color: #fff; border-radius: 10px; padding: 34px 36px 28px; margin-bottom: 16px; }}
  .cover .kicker {{ font-size: 9pt; letter-spacing: 2.5px; text-transform: uppercase;
                    color: #ffd86b; margin-bottom: 8px; }}
  .cover h1 {{ color: #fff; margin-bottom: 6px; }}
  .cover .sub {{ color: #cfe6da; font-size: 10.5pt; max-width: 62ch; }}
  .meta {{ display: flex; gap: 26px; margin-top: 18px; flex-wrap: wrap; }}
  .meta div {{ font-size: 8.5pt; color: #cfe6da; }}
  .meta b {{ display: block; font-size: 13pt; color: #ffd86b; }}
  .chip {{ font-size: 7pt; font-weight: 700; padding: 1px 6px; border-radius: 8px;
           color: #fff; vertical-align: 1px; }}
  .c1 {{ background: #c89b1c; }} .c2 {{ background: #5a6b7a; }} .c3 {{ background: #a4622e; }}
  .group {{ break-inside: avoid; margin-bottom: 13px; }}
  .ghead {{ display: flex; align-items: baseline; gap: 12px; background: #eef4f1;
            border-left: 5px solid #0d4d31; padding: 6px 10px; margin-bottom: 2px; }}
  .gletter {{ font: 700 12pt Georgia, serif; color: #0d4d31; }}
  .gpick {{ font-weight: 600; font-size: 10pt; }}
  .gev {{ margin-left: auto; font-size: 8.5pt; color: #5a6b7a; font-weight: 600; }}
  table.probs td {{ font-size: 8.5pt; padding: 2.5px 7px; }}
  .tn {{ white-space: nowrap; font-weight: 600; }}
  .q {{ width: 110px; }}
  .bar {{ position: relative; background: #e3ebe6; border-radius: 3px; height: 11px; width: 100px; }}
  .bar div {{ height: 11px; border-radius: 3px; }}
  .bar span {{ position: absolute; right: -34px; top: -1px; font-size: 7.5pt; font-weight: 700; }}
  .note {{ font-size: 8.8pt; color: #33424f; margin: 3px 0 2px; }}
  .alt {{ font-size: 8pt; color: #7b8a96; margin-bottom: 0; }}
  .muted {{ color: #7b8a96; font-weight: 400; font-size: 8pt; }}
  .callout {{ background: #fdf6e3; border: 1px solid #e8d590; border-left: 5px solid #c89b1c;
              border-radius: 4px; padding: 9px 12px; margin: 8px 0 12px; font-size: 9pt; }}
  .footer {{ font-size: 7.5pt; color: #8a97a3; margin-top: 10px; }}
  ol, ul {{ margin: 0 0 8px 18px; }} li {{ margin-bottom: 4px; }}
  .formula {{ font-family: Consolas, monospace; font-size: 8.5pt; background: #f1f5f3;
              padding: 8px 12px; border-radius: 4px; display: block; margin: 6px 0 10px; }}
</style></head><body>

<!-- PAGE 1: cover + summary -->
<div class="page">
  <div class="cover">
    <div class="kicker">World Cup 2026 · Football Prediction Game</div>
    <h1>Group Stage Predictions</h1>
    <div class="sub">A research-driven Monte Carlo model of all 72 group matches — built on live Elo
      ratings, bookmaker and Opta probabilities, verified squad/injury news, and venue conditions
      (altitude, heat, host advantage). Picks are optimised for the game's actual scoring rules.</div>
    <div class="meta">
      <div><b>100,000</b> simulated tournaments</div>
      <div><b>{total_ev:.1f} / 64</b> expected points</div>
      <div><b>8 of 12</b> third-place slots, optimally placed</div>
      <div><b>193</b> tiebreaker: total goals</div>
      <div><b>9 June 2026</b> data as of</div>
    </div>
  </div>

  <h2>The Picks</h2>
  <table>
    <tr><th>Grp</th><th>Predicted 1st</th><th>Predicted 2nd</th><th>Predicted 3rd</th><th>EV (pts)</th><th>Confidence</th></tr>
    {summary_rows}
  </table>
  <div class="callout"><b>Tiebreaker — total group-stage goals: 193.</b>
    Simulated mean and median across all 72 matches (80% interval: 175–211, i.e. 2.68 goals/match).
    Benchmarks: at 2022's group-stage rate the 72 games yield ~180; at 2014's, ~204; betting markets
    imply ~209+ via mismatch goals; the 8-of-12 third-place rule pushes the other way by rewarding
    caution. 193 sits at the centre of gravity of the evidence.</div>
  <div class="callout"><b>The 8-slot rule.</b> The game allows a 3rd-place pick in only
    <b>8 of the 12 groups</b> (matching the 8 best thirds who actually advance). The model
    spends those slots where they buy the most expected points — Groups
    <b>A, B, C, D, E, G, I, L</b> — and leaves F, H, J and K blank. This choice was identical
    in all seven sensitivity variants. Full reasoning on the Third-Place Strategy page.</div>
  <p class="footer">Predictions generated 9 June 2026. Entry deadline 11 June 2026, 15:00 UTC —
  re-check final team news (Messi, Neymar, Yamal, Davies) before submitting. Scoring: +1 per
  predicted team that qualifies, +1 bonus for exact position; a predicted 3rd only scores if it
  also reaches the best-8 thirds. Maximum available: 12×4 + 8×2 = 64 points.</p>
</div>

<!-- PAGES 2-4: groups -->
<div class="page"><h2>Group-by-Group Analysis (A–D)</h2>{''.join(rows_groups[0:4])}</div>
<div class="page"><h2>Group-by-Group Analysis (E–H)</h2>{''.join(rows_groups[4:8])}</div>
<div class="page"><h2>Group-by-Group Analysis (I–L)</h2>{''.join(rows_groups[8:12])}</div>

<!-- PAGE 5: thirds + close calls -->
<div class="page">
  <h2>Third-Place Strategy: Spending 8 Slots Across 12 Groups</h2>
  <p>Two layers matter here. First, the format: eight of the twelve 3rd-placed teams advance,
  and historical evidence from every 24-team tournament with best-thirds (WC 1986–94,
  Euro 2016–24) says <b>4 points has never failed to advance</b>; 3 points with goal difference
  ≥ −1 advanced in 5 of 6 tournaments; 3 points with GD ≤ −2 never has. Second, the game:
  you may only enter a 3rd-place pick in <b>8 of the 12 groups</b>, and a predicted 3rd scores
  nothing unless it actually qualifies. So each group's best third-place candidate was valued by
  its <i>marginal EV</i> — P(qualify) + P(finish 3rd <i>and</i> qualify) — and the eight slots
  went to the eight highest:</p>
  <table>
    <tr><th>Grp</th><th>Best 3rd candidate</th><th>P(3rd)</th><th>P(3rd &amp; qual.)</th>
        <th>P(qual. | 3rd)</th><th>P(qualify any way)</th><th>Marginal EV</th><th>Decision</th></tr>
    {third_rows}
  </table>
  <p class="note">The pattern is intuitive: the slots go to "strong thirds" — teams like Senegal,
  Scotland and Czechia whose 3rd-place finishes nearly always survive the cut, or near-certain
  3rds like Ivory Coast and Panama. The skipped groups are exactly the ones where the third is
  either a coin-flip between two minnows (Cape Verde/Saudi Arabia in H, Uzbekistan/DR Congo in K)
  or a weak third unlikely to survive the cut (Sweden in F). The cut-off decision — Group D's
  Paraguay in, Group J's Algeria out, 0.86 vs 0.78 — is the only genuinely close call, and it was
  stable across all seven sensitivity variants.</p>

  <h2>Close Calls &amp; Honest Uncertainty</h2>
  <table>
    <tr><th>Decision</th><th>Pick made</th><th>EV gap</th><th>Why it's close</th></tr>
    {cc_rows}
  </table>
</div>

<!-- PAGE 6-7: methodology -->
<div class="page">
  <h2>How It Was Calculated</h2>
  <h3>1 · Data gathering (all as of 9 June 2026)</h3>
  <p>Five parallel research streams, each cross-checked across multiple sources:</p>
  <ul>
    <li><b>Draw &amp; form</b> — final draw verified vs FIFA/BBC/ESPN (zero discrepancies vs the game's
      seed data); qualifying records and all May–June 2026 warm-up results for the 48 teams.</li>
    <li><b>Ratings &amp; markets</b> — live World Football Elo (eloratings.net, fetched 9 June);
      FIFA rankings (1 April release); DraftKings group-winner, to-qualify and outright odds (5 June).</li>
    <li><b>Squad news</b> — injuries/suspensions/omissions per team from ESPN's tracker, club and
      federation reporting; uncertain items flagged rather than assumed.</li>
    <li><b>Conditions</b> — venue climate normals, roof/AC status, altitude; published research on
      heat (BMJ Open SEM 2025 WBGT study), altitude (McSharry, BMJ 2007) and host advantage
      (ProFootballLogic, 9 World Cups).</li>
    <li><b>Reference models</b> — Opta supercomputer (25k sims, 1–4 June), ESPN's Elo model,
      Nate Silver's PELE, CBS/Bleacher Report consensus; third-place qualification history for all
      six 24-team tournaments since 1986.</li>
  </ul>

  <h3>2 · Team ratings: Elo + three documented adjustment layers</h3>
  <p>Base rating = current World Football Elo (which already incorporates June friendlies and
  long-run home advantage). Three transparent adjustment layers were applied:</p>
  <p><b>Layer 1 — Injury &amp; squad news</b> (Elo points; news is the one thing Elo can't see):</p>
  <table><tr><th>Team</th><th>Adj</th><th>Reason</th></tr>{adj_rows}</table>
  <p><b>Layer 2 — Market anchoring.</b> Where the raw-Elo simulation diverged by &gt;12 percentage
  points from <i>both</i> the devigged bookmaker odds and Opta, the rating was nudged toward
  consensus. Applied sparingly — seven teams:</p>
  <table><tr><th>Team</th><th>Adj</th><th>Trigger</th></tr>{mkt_rows}</table>
</div>

<div class="page">
  <p><b>Layer 3 — Per-match conditions</b> (applied fixture-by-fixture, not to the base rating):</p>
  <table><tr><th>Effect</th><th>Application</th><th>Evidence</th></tr>{cond_rows}</table>

  <h3>3 · Match engine</h3>
  <span class="formula">expected GD = (Elo<sub>A</sub> − Elo<sub>B</sub> + match modifiers) / 250
  &nbsp;&nbsp;·&nbsp;&nbsp; total goals = 2.45 + 0.25·|expected GD| &nbsp;&nbsp;·&nbsp;&nbsp;
  goals ~ independent Poisson(λ<sub>A</sub>, λ<sub>B</sub>)</span>
  <p>Each of the 72 fixtures gets a home/away goal expectancy; 100,000 tournaments are then
  simulated. Group tables apply FIFA tiebreakers (points → goal difference → goals scored; the
  rare head-to-head/fair-play steps are approximated by drawing of lots, a negligible
  simplification at this scale). The twelve 3rd-placed teams are ranked (points → GD → GF) and
  the top eight marked as qualifiers — exactly mirroring how the game's own results sync decides
  the <i>qualified</i> flag.</p>

  <h3>4 · Pick optimisation against the game's scoring</h3>
  <p>For every group, all 24 ordered (1st, 2nd, 3rd) selections were scored:</p>
  <span class="formula">EV = P(qual<sub>1</sub>) + P(pos1<sub>1</sub>) + P(qual<sub>2</sub>) + P(pos2<sub>2</sub>) + P(qual<sub>3</sub>) + P(pos3 ∧ qual<sub>3</sub>)</span>
  <p>Two subtleties. First, a predicted 3rd that finishes 3rd but misses the best-8 cut scores
  <i>zero</i> — so the model prefers third-place candidates whose 3rd-place finishes survive the
  cut (e.g. Senegal 72%, Scotland 70%). Second, <b>the game caps 3rd-place picks at 8 of the 12
  groups</b>. The 1st/2nd choices are unaffected (slot EVs are additive over distinct teams), so
  the optimal allocation is exact: take the best 1st/2nd pair everywhere, compute each group's
  third-slot marginal EV (best full selection minus best 1st/2nd-only selection), and spend the
  8 slots on the 8 largest marginals. No deliberately contrarian picks were made, because the
  game scores absolute accuracy (differentiation only matters via the tiebreaker).</p>

  <h3>5 · Calibration &amp; validation</h3>
  <p>Model group-winner probabilities vs devigged DraftKings odds and the Opta supercomputer
  (group favourites shown; full agreement was checked for all 48 teams):</p>
  <table>
    <tr><th>Grp</th><th>Favourite</th><th>Model</th><th>Market (devig)</th><th>Opta</th></tr>
    {val_rows}
  </table>
  <p class="note">The model deliberately sits between the market (which carries vig and longshot
  bias) and Opta. Residual disagreements are documented above rather than tuned away.</p>

  <h3>6 · Sensitivity analysis</h3>
  <p>The full pipeline was re-run under seven perturbations. <b>All 12 picks are stable</b> under
  every goal-environment and Elo-slope variation — and <b>the choice of which 8 groups receive a
  third-place pick (A, B, C, D, E, G, I, L) was identical in all seven variants</b>; only
  removing entire evidence layers reshuffles the already-flagged coin-flip groups:</p>
  <table>
    <tr><th>Variant</th><th>Goals</th><th>Pick changes vs base</th></tr>
    {sens_rows}
  </table>

  <h3>7 · Known limitations</h3>
  <ul>
    <li>Squad news dated 9 June — late fitness calls (Messi, Neymar, Yamal, Davies, Bentancur) can move individual match odds.</li>
    <li>Friendly results carry signal but also rotation noise; Elo partially absorbs this.</li>
    <li>The 8-of-12 third-place rule may suppress matchday-1/2 scoring (Euro 2016 fell to 1.92 goals/game); the 193-goal tiebreaker already balances this against the format's mismatch goals.</li>
    <li>Independent Poisson slightly underrates draws; FIFA's head-to-head tiebreaker is approximated by lots.</li>
  </ul>
  <p class="footer">Sources: eloratings.net (9 Jun 2026) · FIFA ranking (1 Apr 2026) · DraftKings via ESPN
  (5 Jun 2026) · Opta/The Analyst supercomputer (1–4 Jun 2026) · ESPN Elo model · Nate Silver PELE ·
  CBS Sports &amp; Bleacher Report consensus picks · ESPN injury tracker · club/federation reports ·
  BMJ Open Sport &amp; Exercise Medicine 2025 (WBGT) · McSharry BMJ 2007 (altitude) · ProFootballLogic
  (host advantage) · World Weather Attribution · football365 warm-up results · Wikipedia third-place
  ranking records (WC 1986–94, Euro 2016–24). Model: 100,000-iteration Monte Carlo, seed 20260609,
  code in <span style="font-family:Consolas">analysis/wc2026-model/</span>.</p>
</div>

</body></html>"""

open('report.html', 'w', encoding='utf-8').write(html)
print('report.html written,', len(html), 'bytes')
