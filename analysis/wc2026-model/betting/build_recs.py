"""Render out/RECOMMENDATIONS.md + .pdf from out/analysis.json."""
import json, os, subprocess, sys
from collections import defaultdict
from common import HERE, GROUPS

OUT = os.path.join(HERE, 'out')
NAME = {
 'MEX': 'Mexico', 'RSA': 'South Africa', 'KOR': 'South Korea', 'CZE': 'Czechia',
 'CAN': 'Canada', 'BIH': 'Bosnia & Herz.', 'QAT': 'Qatar', 'SUI': 'Switzerland',
 'BRA': 'Brazil', 'MAR': 'Morocco', 'HAI': 'Haiti', 'SCO': 'Scotland',
 'USA': 'USA', 'PAR': 'Paraguay', 'AUS': 'Australia', 'TUR': 'Türkiye',
 'GER': 'Germany', 'CUW': 'Curaçao', 'CIV': 'Ivory Coast', 'ECU': 'Ecuador',
 'NED': 'Netherlands', 'JPN': 'Japan', 'SWE': 'Sweden', 'TUN': 'Tunisia',
 'BEL': 'Belgium', 'EGY': 'Egypt', 'IRN': 'Iran', 'NZL': 'New Zealand',
 'ESP': 'Spain', 'CPV': 'Cape Verde', 'KSA': 'Saudi Arabia', 'URU': 'Uruguay',
 'FRA': 'France', 'SEN': 'Senegal', 'IRQ': 'Iraq', 'NOR': 'Norway',
 'ARG': 'Argentina', 'ALG': 'Algeria', 'AUT': 'Austria', 'JOR': 'Jordan',
 'POR': 'Portugal', 'COD': 'DR Congo', 'UZB': 'Uzbekistan', 'COL': 'Colombia',
 'ENG': 'England', 'CRO': 'Croatia', 'GHA': 'Ghana', 'PAN': 'Panama',
}
MKT = {'group_winner': 'To Win Group', 'to_qualify': 'To Qualify (reach R32)',
       'to-finish-2nd': 'To Finish 2nd', 'straight-forecast': 'Straight Forecast (1st/2nd)',
       'group-exact-finish-order': 'Exact Group Finish Order'}
BOOK = {'B3': 'bet365', 'WH': 'William Hill', 'SK': 'Sky Bet', 'PP': 'Paddy Power',
        'VC': 'BetVictor', 'UN': 'Unibet', 'LD': 'Ladbrokes', 'CE': 'Coral',
        'FR': 'Betfred', 'WA': 'Betway', 'VE': 'Virgin Bet', 'SX': 'Spreadex',
        'KN': 'BetMGM', 'BY': 'BoyleSports', 'AKB': 'AK Bets', 'QN': 'QuinnBet',
        'EE': '888sport', 'OE': '10bet', 'S6': 'Star Sports', 'G5': 'BetGoodwin',
        'PUP': 'PricedUp', 'SI': 'Sporting Index', 'BAH': 'BetAhoy', 'BTT': 'BetTom',
        'BRS': 'BresBet', 'BF': 'Betfair Exch', 'MA': 'Matchbook'}


def venue_label(v):
    if v.startswith('bookie:'):
        code = v.split(':')[1].split(' ')[0]
        return BOOK.get(code, code) + (' ⚠soft' if 'soft' in v else '')
    return v.replace('exchange:', '').title() + ' (exchange)'


def sel_label(b):
    if 'team' in b:
        return f"{NAME[b['team']]} (Group {b['group']})"
    return f"{b['selection']} (Group {b['group']})"


def refs_label(b):
    r = b.get('refs', {})
    parts = []
    for k, lbl in (('opta', 'Opta'), ('espn', 'ESPN'), ('opta_win', 'Opta'),
                   ('dk_devig', 'DK devig'), ('polymarket', 'Polymarket')):
        v = r.get(k)
        if v:
            parts.append(f'{lbl} {v*100:.0f}%')
    if 'vals' in r:
        parts.append('refs ' + '/'.join(f'{v*100:.0f}%' for v in r['vals']))
    return ', '.join(parts) or '—'


def main():
    a = json.load(open(os.path.join(OUT, 'analysis.json')))
    bets, meta = a['bets'], a['meta']
    tiers = {'A': [b for b in bets if b['tier'] == 'A'],
             'B': [b for b in bets if b['tier'] == 'B']}
    expo = {t: sum(b.get('stake_pct') or b.get('liability_pct', 0) for b in tiers[t])
            for t in 'AB'}

    # correlation notes
    by_group = defaultdict(list)
    for b in bets:
        by_group[b['group']].append(b)
    corr = []
    for g, gb in sorted(by_group.items()):
        if len(gb) > 1:
            descs = [f"{b['bet'].lower()} {b.get('team') or b.get('selection')} "
                     f"{MKT.get(b['market'], b['market'])} [{b['tier']}]" for b in gb]
            corr.append((g, descs))

    L = []
    add = L.append
    add('# WC2026 Group-Stage Betting Recommendations')
    add('')
    add(f"Generated from prices fetched **{meta.get('exchange_fetched_at', '?')}** "
        f"(exchanges) / **{meta.get('oddschecker_fetched_at', '?')}** (bookies), "
        f"{meta.get('model_sims'):,}-simulation model. Stakes are % of your betting "
        f"bankroll (quarter-Kelly, conservative p, capped). **Prices move — re-run "
        f"`python run_pipeline.py` and re-check each price before placing.**"
        + (f" All stakes scaled ×{meta['exposure_scale']} so the whole card risks "
           f"≤{meta['config']['max_total_exposure']:.0f}% of bankroll "
           f"(raw quarter-Kelly wanted {meta['raw_exposure_pct']}%)."
           if meta.get('exposure_scale', 1) < 1 else ''))
    add('')
    add('## TLDR — the card')
    add('')
    add(f"**Tier A ({len(tiers['A'])} bets, ~{expo['A']:.1f}% total bankroll)** — "
        'model edge corroborated by an independent forecaster (Opta/ESPN):')
    add('')
    add('| # | Bet | Market | Best price (venue) | Stake |')
    add('|---|-----|--------|--------------------|-------|')
    for i, b in enumerate(tiers['A'], 1):
        odds = b.get('odds') or b.get('lay_odds')
        size = b.get('stake_pct') or b.get('liability_pct')
        kind = 'Back' if b['bet'] == 'BACK' else 'LAY'
        sz = f"{size}%" + (' liability' if b['bet'] == 'LAY' else '')
        add(f"| {i} | {kind} **{sel_label(b)}** | {MKT.get(b['market'], b['market'])} | "
            f"{odds} ({venue_label(b['venue'])}) | {sz} |")
    add('')
    add(f"**Tier B ({len(tiers['B'])} bets, ~{expo['B']:.1f}% total bankroll)** — "
        'model-only edges at reduced stakes (no external corroboration, or forecasters disagree):')
    add('')
    add('| # | Bet | Market | Best price (venue) | Stake |')
    add('|---|-----|--------|--------------------|-------|')
    for i, b in enumerate(tiers['B'], 1):
        odds = b.get('odds') or b.get('lay_odds')
        size = b.get('stake_pct') or b.get('liability_pct')
        kind = 'Back' if b['bet'] == 'BACK' else 'LAY'
        sz = f"{size}%" + (' liability' if b['bet'] == 'LAY' else '')
        add(f"| {i} | {kind} {sel_label(b)} | {MKT.get(b['market'], b['market'])} | "
            f"{odds} ({venue_label(b['venue'])}) | {sz} |")
    add('')
    add('### Before you place anything (60 seconds each)')
    add('')
    add('1. **Check the price still stands** — anything below ~90% of the listed odds, skip or take the listed alternative venue.')
    add('2. **"To Qualify" rules check (once per book)**: confirm the market settles on *reaching the Round of 32* (best thirds count). All evidence says it does, but if a book settles top-2-only, skip the qualify bets there.')
    add('3. **Lays**: the % shown is *liability* (max loss), not stake. On Betfair enter the backer\'s stake that produces that liability.')
    add('4. **Correlated groups** (below): if you want lower variance, halve stakes where multiple bets share a group.')
    add('')
    add('## Correlated exposure by group')
    add('')
    for g, descs in corr:
        add(f"- **Group {g}**: {'; '.join(descs)}")
    add('')
    add('## Rationale per bet')
    add('')
    for tier in 'AB':
        for b in tiers[tier]:
            odds = b.get('odds') or b.get('lay_odds')
            add(f"### [{tier}] {b['bet'].title()} {sel_label(b)} — "
                f"{MKT.get(b['market'], b['market'])} @ {odds}")
            add('')
            if b['bet'] == 'BACK':
                add(f"- Model probability: **{b['p_used']*100:.1f}%** "
                    f"(independent {b['p_independent']*100:.1f}% / anchored {b['p_anchored']*100:.1f}%; "
                    f"staking uses the lower) vs market implied **{b['implied']*100:.1f}%**.")
                add(f"- Expected value at the executable price: "
                    f"**{min(b['ev_independent'], b['ev_anchored'])*100:+.0f}%** "
                    f"(worse of the two variants).")
                if b.get('benchmark_exchange_mid'):
                    add(f"- Exchange consensus (Betfair mid): {b['benchmark_exchange_mid']*100:.1f}% "
                        f"— the bet only needs to beat the *best available* price, not the consensus.")
                add(f"- Independent references: {refs_label(b)}.")
                if b.get('alt_offers'):
                    alts = ', '.join(f'{r} @ {venue_label(v)}' for _, r, v in b['alt_offers'])
                    add(f'- Fallback prices: {alts}.')
            else:
                add(f"- Lay-implied probability **{b['implied']*100:.1f}%** vs model max "
                    f"**{b['p_used_max']*100:.1f}%** (independent {b['p_independent']*100:.1f}% / "
                    f"anchored {b['p_anchored']*100:.1f}%).")
                add(f"- EV per unit liability: **{b['ev_per_liability']*100:+.1f}%** "
                    f"after commission. References: {refs_label(b)}.")
            for fl in b.get('flags', []):
                add(f'- ⚠ {fl}')
            add('')
    add('## Method (summary)')
    add('')
    add('200k-iteration Monte Carlo (live Elo 9 Jun + injury layer + venue conditions), run twice: '
        'with and without market anchoring. A bet qualifies only if BOTH variants show ≥5% EV at the '
        'best executable price (exchange prices commission-adjusted: Betfair 5%, Smarkets 2%, '
        'Matchbook 4%). Tier A additionally requires Opta or ESPN to clear the implied probability '
        'by 2pp with no forecaster >5pp below it. Stakes: quarter-Kelly on the conservative '
        'probability, capped 2%/0.75%. Niche markets (finish-2nd/forecast/exact-order) have no '
        'external reference models, are priced from the simulation joint distribution, demand 10%+ EV '
        'and are always Tier B. Full methodology, caveats and repeat instructions: `betting/README.md`.')
    add('')
    add('## Caveats')
    add('')
    add('- The model\'s biggest edges (minnow advancement) rest on the 8-of-12 thirds format being '
        'underpriced; Opta/ESPN partially agree but the magnitude is uncertain — hence the caps.')
    add('- Anonymous exchange data is delayed; soft bookmakers will limit winning accounts.')
    add('- This is a fun quantitative exercise, not financial advice. Only bet what you\'re happy to lose; '
        'expected variance on this card is large — losing the entire staked amount is a normal outcome.')
    add('')
    add(f"*Repeat run: `cd analysis/wc2026-model/betting && python run_pipeline.py` "
        f"(see README). Bets: {len(bets)} · Tier A exposure {expo['A']:.1f}% · "
        f"Tier B exposure {expo['B']:.1f}% · max total {expo['A']+expo['B']:.1f}% of bankroll.*")

    md = '\n'.join(L)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'RECOMMENDATIONS.md'), 'w', encoding='utf-8') as f:
        f.write(md)

    # minimal styled HTML -> PDF
    import html as H
    rows = md.split('\n')
    body = []
    in_table = False
    for ln in rows:
        if ln.startswith('|'):
            cells = [c.strip() for c in ln.strip('|').split('|')]
            if all(set(c) <= set('-: ') for c in cells):
                continue
            tag = 'th' if not in_table else 'td'
            if not in_table:
                body.append('<table>')
                in_table = True
            body.append('<tr>' + ''.join(f'<{tag}>{md_inline(c)}</{tag}>' for c in cells) + '</tr>')
            continue
        if in_table:
            body.append('</table>')
            in_table = False
        if ln.startswith('### '):
            body.append(f'<h3>{md_inline(ln[4:])}</h3>')
        elif ln.startswith('## '):
            body.append(f'<h2>{md_inline(ln[3:])}</h2>')
        elif ln.startswith('# '):
            body.append(f'<h1>{md_inline(ln[2:])}</h1>')
        elif ln.startswith('- '):
            body.append(f'<li>{md_inline(ln[2:])}</li>')
        elif ln.strip().startswith(tuple(f'{i}.' for i in range(1, 10))):
            body.append(f'<li>{md_inline(ln.strip()[2:].strip())}</li>')
        elif ln.strip():
            body.append(f'<p>{md_inline(ln)}</p>')
    if in_table:
        body.append('</table>')
    html_doc = ('<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
                '@page{size:A4;margin:13mm} body{font:9.5pt/1.45 "Segoe UI",sans-serif;color:#1c2733}'
                'h1{font:700 20pt Georgia,serif;color:#0d4d31}'
                'h2{font:700 13pt Georgia,serif;color:#0d4d31;border-bottom:2px solid #0d4d31;'
                'padding-bottom:3px;margin:14px 0 8px}'
                'h3{font:600 10.5pt "Segoe UI";color:#0d4d31;margin:10px 0 4px}'
                'table{border-collapse:collapse;width:100%;margin:6px 0}'
                'th{background:#0d4d31;color:#fff;font-size:8pt;text-transform:uppercase;'
                'padding:4px 6px;text-align:left}'
                'td{padding:3px 6px;border-bottom:1px solid #dde5e0;font-size:8.5pt}'
                'tr:nth-child(even) td{background:#f4f8f6}'
                'li{margin:0 0 3px 16px}p{margin:0 0 6px}'
                '</style></head><body>' + '\n'.join(body) + '</body></html>')
    hp = os.path.join(OUT, 'RECOMMENDATIONS.html')
    with open(hp, 'w', encoding='utf-8') as f:
        f.write(html_doc)
    pdf = os.path.join(OUT, 'RECOMMENDATIONS.pdf')
    r = subprocess.run(['npx', 'playwright', 'pdf', 'file:///' + hp.replace('\\', '/'), pdf],
                       capture_output=True, shell=(os.name == 'nt'))
    print('MD + HTML written;', 'PDF written' if r.returncode == 0 else
          f'PDF FAILED: {r.stderr[-200:]}')


def md_inline(s):
    import re as _re, html as _h
    s = _h.escape(s)
    s = _re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = _re.sub(r'\*(.+?)\*', r'<i>\1</i>', s)
    s = _re.sub(r'`(.+?)`', r'<code>\1</code>', s)
    return s


if __name__ == '__main__':
    main()
