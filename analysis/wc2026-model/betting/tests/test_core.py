"""Unit + integration tests for the WC2026 betting pipeline. Run: pytest -q"""
import json, os, sys, math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import common
import references as R
import analyze
from common import frac_to_dec, norm_team, GROUPS, GROUP_OF


# ---------- odds parsing ----------
@pytest.mark.parametrize('s,expected', [
    ('7/2', 4.5), ('1/2', 1.5), ('EVS', 2.0), ('Evens', 2.0),
    ('11', 12.0), ('10/11', 1.9090909), ('100/30', 4.3333333),
    ('-', None), ('SP', None), ('', None), (None, None), ('abc', None),
])
def test_frac_to_dec(s, expected):
    got = frac_to_dec(s)
    if expected is None:
        assert got is None
    else:
        assert got == pytest.approx(expected, rel=1e-6)


# ---------- team normalisation ----------
@pytest.mark.parametrize('name,code', [
    ('Mexico', 'MEX'), ('Korea Republic', 'KOR'), ('South Korea', 'KOR'),
    ('Czechia', 'CZE'), ('Czech Republic', 'CZE'), ('Trkiye', 'TUR'),
    ('Turkiye', 'TUR'), ('Bosnia-Herzegovina', 'BIH'), ('Bosnia and Herzegovina', 'BIH'),
    ("Cote D'Ivoire", 'CIV'), ('Ivory Coast', 'CIV'), ('Congo DR', 'COD'),
    ('DR Congo', 'COD'), ('Curaao', 'CUW'), ('Curacao', 'CUW'),
    ('United States', 'USA'), ('USA', 'USA'), ('Cabo Verde', 'CPV'),
    ('IR Iran', 'IRN'), ('utter nonsense team', None),
])
def test_norm_team(name, code):
    assert norm_team(name) == code


def test_groups_complete():
    assert len(GROUPS) == 12
    assert len(GROUP_OF) == 48
    for teams in GROUPS.values():
        assert len(teams) == 4


# ---------- staking maths ----------
def test_kelly_hand_calc():
    # p=0.5 at 2.2: f = (0.5*2.2-1)/(1.2) = 0.0833...
    assert analyze.kelly(0.5, 2.2) == pytest.approx(0.1 / 1.2)
    assert analyze.kelly(0.4, 2.0) == 0.0          # negative edge clamps to 0
    assert analyze.kelly(0.9, 1.05) == 0.0         # -EV short price
    assert analyze.kelly(0.5, None) == 0.0


def test_lay_kelly_hand_calc():
    # lay at 3.0, commission 5%, p=0.2: b = 0.95/2 = 0.475
    # f = ((0.8*0.475) - 0.2)/0.475 = (0.38-0.2)/0.475 = 0.378947
    assert analyze.lay_kelly(0.2, 3.0, 0.05) == pytest.approx(0.18 / 0.475)
    assert analyze.lay_kelly(0.5, 3.0, 0.05) == 0.0   # no edge
    assert analyze.lay_kelly(0.2, 1.0, 0.05) == 0.0


def test_effective_odds_commission():
    assert analyze.eff(2.0, 'betfair') == pytest.approx(1.95)
    assert analyze.eff(2.0, 'smarkets') == pytest.approx(1.98)
    assert analyze.eff(2.0, 'matchbook') == pytest.approx(1.96)
    assert analyze.eff(2.0, 'bookie:B3') == pytest.approx(2.0)  # no commission


# ---------- references ----------
def test_dk_devig_sums_to_one_per_group():
    for g, teams in GROUPS.items():
        s = sum(R.DK_WIN[c] for c in teams)
        assert s == pytest.approx(1.0, abs=1e-9), f'group {g} devig sum {s}'


def test_reference_coverage():
    for c in GROUP_OF:
        assert c in R.OPTA_ADV
        assert c in R.ESPN_ADV
        assert c in R.DK_WIN


# ---------- model artefacts ----------
@pytest.fixture(scope='module')
def model():
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     'model_independent.json')
    if not os.path.exists(p):
        pytest.skip('model_independent.json not built')
    return json.load(open(p))


def test_joint_distribution_sums_to_one(model):
    for g, dist in model['joint'].items():
        assert sum(dist.values()) == pytest.approx(1.0, abs=1e-6), g


def test_joint_marginal_consistency(model):
    """P(team 1st) from joint must match the marginal p1 within MC tolerance."""
    for g, teams in GROUPS.items():
        for c in teams:
            from_joint = sum(p for k, p in model['joint'][g].items()
                             if k.split('-')[0] == c)
            assert from_joint == pytest.approx(model['teams'][c]['p1'], abs=0.004), (g, c)


def test_advance_probs_sum_to_32(model):
    total = sum(model['teams'][c]['pq'] for c in GROUP_OF)
    assert total == pytest.approx(32.0, abs=0.05)


# ---------- multi-selection parsing ----------
@pytest.mark.parametrize('name,group,expected', [
    ('Mexico / South Korea', 'A', ['MEX', 'KOR']),
    ('Mexico/South Korea', 'A', ['MEX', 'KOR']),
    ('England, Croatia, Ghana, Panama', 'L', ['ENG', 'CRO', 'GHA', 'PAN']),
    ('Mexico / Brazil', 'A', None),          # cross-group -> reject
    ('Special offers', 'A', None),
])
def test_parse_multi(name, group, expected):
    assert analyze.parse_multi(name, group) == expected


# ---------- live-cache integration (skip when caches absent) ----------
@pytest.fixture(scope='module')
def exchanges():
    c = common.load_cache('exchanges.json')
    if not c or not c.get('sources'):
        pytest.skip('no exchange cache')
    return c['sources']


def test_qualify_market_means_advance_not_top2(model, exchanges):
    """Document + verify the semantics assumption: exchange 'to qualify' prices track
    P(advance incl. best thirds), not P(top 2). Czechia is the cleanest probe."""
    bf = exchanges.get('betfair', {}).get('to_qualify', {}).get('A', {}).get('CZE')
    if not bf or not (bf.get('back') and bf.get('lay')):
        pytest.skip('no Betfair CZE qualify quote')
    mid = (1 / bf['back'] + 1 / bf['lay']) / 2
    p_adv = model['teams']['CZE']['pq']
    p_top2 = model['teams']['CZE']['p1'] + model['teams']['CZE']['p2']
    assert abs(mid - p_adv) < abs(mid - p_top2), (
        f'exchange mid {mid:.3f} closer to top2 {p_top2:.3f} than advance {p_adv:.3f} — '
        'qualify-semantics assumption violated!')


def test_exchange_winner_books_are_coherent(exchanges):
    """Within each Betfair winner market, back-implied probs sum to <1.1 and >0.85
    (a wildly different sum means we mis-parsed runners)."""
    bf = exchanges.get('betfair', {}).get('group_winner', {})
    for g, runners in bf.items():
        backs = [1 / q['back'] for q in runners.values() if q.get('back')]
        if len(backs) == 4:
            assert 0.85 < sum(backs) < 1.15, (g, sum(backs))


@pytest.fixture(scope='module')
def analysis():
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     'out', 'analysis.json')
    if not os.path.exists(p):
        pytest.skip('analysis.json not produced yet')
    return json.load(open(p))


def test_analysis_stake_caps_and_tiers(analysis):
    for b in analysis['bets']:
        size = b.get('stake_pct') or b.get('liability_pct')
        cap = 2.0 if b['tier'] == 'A' else 0.75
        assert size <= cap + 1e-9, b
        if b['bet'] == 'BACK' and 'p_used' in b:
            assert min(b['ev_independent'], b['ev_anchored']) >= 0.05 - 1e-9 or \
                b['market'] in ('to-finish-2nd', 'straight-forecast',
                                'group-exact-finish-order'), b


def test_tier_A_has_corroboration(analysis):
    for b in analysis['bets']:
        if b['tier'] != 'A' or b['bet'] != 'BACK':
            continue
        refs = b.get('refs', {})
        implied = b['implied']
        forecasters = [refs.get('opta'), refs.get('espn'), refs.get('opta_win')]
        assert any(v and v >= implied + 0.02 - 1e-9 for v in forecasters), b
