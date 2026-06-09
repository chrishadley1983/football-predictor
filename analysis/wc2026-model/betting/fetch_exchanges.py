"""Fetch WC2026 group-market prices from Smarkets, Betfair (ERO), Matchbook, Polymarket.

Each source is independent: failures are reported but don't kill the run.
Normalised output -> cache/exchanges.json:
{ sources: { <src>: { group_winner: {A: {MEX: {back, lay, last, liquidity}}},
                      to_qualify:   {A: {MEX: {...}}} } } }
Prices are decimal odds; polymarket entries carry implied probability in 'prob'.
"""
import json, re, sys, time
from common import (GROUPS, GROUP_OF, norm_team, http_json, save_raw, save_cache)

BF_AK = 'nzIFcwyWhrlwYMrh'
BF_TYPES = ('MARKET_STATE,MARKET_RATES,MARKET_DESCRIPTION,EVENT,RUNNER_DESCRIPTION,'
            'RUNNER_STATE,RUNNER_EXCHANGE_PRICES_BEST')


def fetch_smarkets():
    out = {'group_winner': {}, 'to_qualify': {}}
    mkts = []
    for offset in (0,):
        r = http_json('https://api.smarkets.com/v3/events/43058693/markets/?limit=200')
        mkts += r.get('markets', [])
    save_raw('smarkets_markets.json', mkts)
    winner_ids, qualify_ids = {}, {}
    for m in mkts:
        name = m.get('name', '')
        gm = re.search(r'Group ([A-L]) - Winner$', name)
        qm = re.search(r'Group ([A-L]) - To Qualify - (.+)$', name)
        if gm:
            winner_ids[m['id']] = gm.group(1)
        elif qm:
            code = norm_team(qm.group(2))
            if code:
                qualify_ids[m['id']] = (qm.group(1), code)
    # contracts for winner markets (runner names); quotes for everything
    all_ids = list(winner_ids) + list(qualify_ids)
    quotes = {}
    for i in range(0, len(all_ids), 20):
        chunk = ','.join(all_ids[i:i + 20])
        quotes.update(http_json(f'https://api.smarkets.com/v3/markets/{chunk}/quotes/'))
    save_raw('smarkets_quotes.json', quotes)
    contracts = {}
    for mid in winner_ids:
        r = http_json(f'https://api.smarkets.com/v3/markets/{mid}/contracts/')
        contracts[mid] = r.get('contracts', [])
        time.sleep(0.15)
    save_raw('smarkets_contracts.json', contracts)

    def px(cid):
        q = quotes.get(str(cid)) or quotes.get(cid) or {}
        def best(side, agg):
            arr = q.get(side) or []
            ps = [10000 / o['price'] for o in arr if o.get('price')]
            return round(agg(ps), 3) if ps else None
        # bids = available to back at, offers = available to lay at (smarkets quote semantics:
        # 'bids' are buy orders you can sell into; treat max bid as lay, min offer as back)
        back = best('offers', min)
        lay = best('bids', max)
        return back, lay

    for mid, g in winner_ids.items():
        out['group_winner'].setdefault(g, {})
        for c in contracts.get(mid, []):
            code = norm_team(c.get('name', ''))
            if not code:
                continue
            back, lay = px(c['id'])
            out['group_winner'][g][code] = {'back': back, 'lay': lay}
    for mid, (g, code) in qualify_ids.items():
        # binary market: first contract is Yes
        r = http_json(f'https://api.smarkets.com/v3/markets/{mid}/contracts/')
        ys = [c for c in r.get('contracts', []) if c.get('name', '').lower() != 'no']
        if not ys:
            continue
        back, lay = px(ys[0]['id'])
        out['to_qualify'].setdefault(g, {})[code] = {'back': back, 'lay': lay}
        time.sleep(0.15)
    return out


def fetch_betfair():
    out = {'group_winner': {}, 'to_qualify': {}}
    type_codes = []
    for g in GROUPS:
        type_codes += [f'GROUP_{g}_WINNER', f'GROUP_{g}_WINNER_SGX', f'GROUP_{g}_TO_QUALIFY']
    body = {'filter': {'competitionIds': [12469077], 'marketTypeCodes': type_codes},
            'maxResults': 60, 'currencyCode': 'GBP', 'locale': 'en_GB'}
    found = http_json(
        f'https://scan-inbf.betfair.com/www/sports/navigation/facet/v1/search?_ak={BF_AK}&alt=json',
        method='POST', body=body)
    save_raw('betfair_search.json', found)
    # results carry bare marketIds; market type comes back in the ERO description
    ids = sorted({r['marketId'] for r in found.get('results', []) if r.get('marketId')})
    if not ids:
        raise RuntimeError('betfair search returned no markets')
    markets = {}
    prices = {}
    for i in range(0, len(ids), 10):
        chunk = ','.join(ids[i:i + 10])
        r = http_json('https://ero.betfair.com/www/sports/exchange/readonly/v1/bymarket'
                      f'?_ak={BF_AK}&currencyCode=GBP&locale=en_GB&marketIds={chunk}'
                      f'&rollupLimit=2&rollupModel=STAKE&types={BF_TYPES}')
        for en in r.get('eventTypes', []):
            for ev in en.get('eventNodes', []):
                for mn in ev.get('marketNodes', []):
                    prices[mn['marketId']] = mn
        time.sleep(0.3)
    save_raw('betfair_prices.json', prices)
    for mid, mn in prices.items():
        desc = mn.get('description', {}) or markets.get(mid, {})
        mtype = desc.get('marketType', '')
        m = re.match(r'GROUP_([A-L])_(WINNER|TO_QUALIFY)', mtype or '')
        if not m:
            continue
        g, kind = m.group(1), ('group_winner' if m.group(2) == 'WINNER' else 'to_qualify')
        st = mn.get('state', {})
        liq = st.get('totalMatched')
        for rn in mn.get('runners', []):
            code = norm_team((rn.get('description') or {}).get('runnerName', ''))
            if not code:
                continue
            ex = rn.get('exchange', {})
            atb = ex.get('availableToBack') or []
            atl = ex.get('availableToLay') or []
            out[kind].setdefault(g, {})[code] = {
                'back': atb[0]['price'] if atb else None,
                'lay': atl[0]['price'] if atl else None,
                'last': (rn.get('state') or {}).get('lastPriceTraded'),
                'liquidity': liq,
            }
    return out


def fetch_matchbook():
    out = {'group_winner': {}, 'to_qualify': {}}
    events = []
    for offset in (0, 100, 200):
        r = http_json('https://api.matchbook.com/edge/rest/events'
                      f'?sport-ids=15&per-page=100&offset={offset}&words=World%20Cup')
        events += r.get('events', [])
        if len(r.get('events', [])) < 100:
            break
    save_raw('matchbook_events.json', events)
    targets = {}
    for e in events:
        name = e.get('name', '')
        m = re.match(r'FIFA World Cup - Group ([A-L]) (Winner|To Qualify)$', name)
        if m:
            targets[e['id']] = (m.group(1), 'group_winner' if m.group(2) == 'Winner' else 'to_qualify')
    raws = {}
    for eid, (g, kind) in targets.items():
        r = http_json(f'https://api.matchbook.com/edge/rest/events/{eid}'
                      '?include-prices=true&price-depth=3')
        raws[str(eid)] = r
        for mk in r.get('markets', []):
            for rn in mk.get('runners', []):
                code = norm_team(rn.get('name', ''))
                if not code:
                    continue
                backs = [p for p in rn.get('prices', []) if p.get('side') == 'back']
                lays = [p for p in rn.get('prices', []) if p.get('side') == 'lay']
                out[kind].setdefault(g, {})[code] = {
                    'back': max((p['decimal-odds'] for p in backs), default=None),
                    'lay': min((p['decimal-odds'] for p in lays), default=None),
                    'liquidity': mk.get('volume'),
                }
        time.sleep(0.2)
    save_raw('matchbook_details.json', raws)
    return out


def fetch_polymarket():
    out = {'group_winner': {}, 'advance': {}}
    raws = {}
    for g in GROUPS:
        slug = f'world-cup-group-{g.lower()}-winner'
        r = http_json(f'https://gamma-api.polymarket.com/events?slug={slug}')
        raws[slug] = r
        for ev in r if isinstance(r, list) else [r]:
            for mk in ev.get('markets', []):
                q = mk.get('groupItemTitle') or mk.get('question', '')
                code = norm_team(q.replace('Will', '').replace('win Group', '').strip())
                if not code:
                    # question form: "Will X win Group A?"
                    m = re.search(r'Will (.+?) win', mk.get('question', ''))
                    code = norm_team(m.group(1)) if m else None
                if not code:
                    continue
                try:
                    prices = json.loads(mk.get('outcomePrices', '[]'))
                    yes = float(prices[0]) if prices else None
                except (ValueError, IndexError):
                    yes = None
                if yes:
                    out['group_winner'].setdefault(g, {})[code] = {
                        'prob': yes, 'back': round(1 / yes, 3) if yes > 0.001 else None,
                        'liquidity': ev.get('liquidity'),
                    }
        time.sleep(0.15)
    r = http_json('https://gamma-api.polymarket.com/events?id=414231')
    raws['advance'] = r
    for ev in r if isinstance(r, list) else [r]:
        for mk in ev.get('markets', []):
            title = mk.get('groupItemTitle') or ''
            code = norm_team(title)
            if not code:
                m = re.search(r'Will (.+?) advance', mk.get('question', ''))
                code = norm_team(m.group(1)) if m else None
            if not code:
                continue
            try:
                prices = json.loads(mk.get('outcomePrices', '[]'))
                yes = float(prices[0]) if prices else None
            except (ValueError, IndexError):
                yes = None
            if yes:
                out['advance'][code] = {'prob': yes,
                                        'back': round(1 / yes, 3) if yes > 0.001 else None}
    save_raw('polymarket.json', raws)
    return out


def main():
    sources, errors = {}, {}
    for name, fn in [('smarkets', fetch_smarkets), ('betfair', fetch_betfair),
                     ('matchbook', fetch_matchbook), ('polymarket', fetch_polymarket)]:
        try:
            sources[name] = fn()
            nw = sum(len(v) for v in sources[name].get('group_winner', {}).values())
            nq = sum(len(v) for v in sources[name].get('to_qualify', {}).values()) \
                if 'to_qualify' in sources[name] else len(sources[name].get('advance', {}))
            print(f'{name}: OK ({nw} winner runners, {nq} qualify/advance runners)')
        except Exception as e:
            errors[name] = str(e)
            print(f'{name}: FAILED — {e}', file=sys.stderr)
    save_cache('exchanges.json', {'sources': sources, 'errors': errors})
    if not sources:
        sys.exit(1)


if __name__ == '__main__':
    main()
