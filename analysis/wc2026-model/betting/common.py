"""Shared utilities for the WC2026 betting pipeline."""
import json, os, re, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
RAW = os.path.join(CACHE, 'raw')
os.makedirs(RAW, exist_ok=True)

UA = {'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                     '(KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'),
      'Accept': 'application/json'}

GROUPS = {
 'A': ['MEX', 'RSA', 'KOR', 'CZE'], 'B': ['CAN', 'BIH', 'QAT', 'SUI'],
 'C': ['BRA', 'MAR', 'HAI', 'SCO'], 'D': ['USA', 'PAR', 'AUS', 'TUR'],
 'E': ['GER', 'CUW', 'CIV', 'ECU'], 'F': ['NED', 'JPN', 'SWE', 'TUN'],
 'G': ['BEL', 'EGY', 'IRN', 'NZL'], 'H': ['ESP', 'CPV', 'KSA', 'URU'],
 'I': ['FRA', 'SEN', 'IRQ', 'NOR'], 'J': ['ARG', 'ALG', 'AUT', 'JOR'],
 'K': ['POR', 'COD', 'UZB', 'COL'], 'L': ['ENG', 'CRO', 'GHA', 'PAN'],
}
GROUP_OF = {c: g for g, teams in GROUPS.items() for c in teams}

_ALIASES = {
 'mexico': 'MEX', 'south africa': 'RSA', 'south korea': 'KOR', 'korea republic': 'KOR',
 'korea': 'KOR', 'czechia': 'CZE', 'czech republic': 'CZE', 'czech rep': 'CZE',
 'canada': 'CAN', 'bosnia': 'BIH', 'bosnia-herzegovina': 'BIH', 'bosnia and herzegovina': 'BIH',
 'bosnia herzegovina': 'BIH', 'bosnia-herz': 'BIH', 'qatar': 'QAT', 'switzerland': 'SUI',
 'brazil': 'BRA', 'morocco': 'MAR', 'haiti': 'HAI', 'scotland': 'SCO',
 'usa': 'USA', 'united states': 'USA', 'paraguay': 'PAR', 'australia': 'AUS',
 'turkey': 'TUR', 'turkiye': 'TUR', 'trkiye': 'TUR', 'germany': 'GER',
 'curacao': 'CUW', 'curaao': 'CUW', 'cura ao': 'CUW',
 'ivory coast': 'CIV', 'cote divoire': 'CIV', "cote d'ivoire": 'CIV', 'ecuador': 'ECU',
 'netherlands': 'NED', 'japan': 'JPN', 'sweden': 'SWE', 'tunisia': 'TUN',
 'belgium': 'BEL', 'egypt': 'EGY', 'iran': 'IRN', 'ir iran': 'IRN', 'new zealand': 'NZL',
 'spain': 'ESP', 'cape verde': 'CPV', 'cabo verde': 'CPV', 'saudi arabia': 'KSA',
 'uruguay': 'URU', 'france': 'FRA', 'senegal': 'SEN', 'iraq': 'IRQ', 'norway': 'NOR',
 'argentina': 'ARG', 'algeria': 'ALG', 'austria': 'AUT', 'jordan': 'JOR',
 'portugal': 'POR', 'dr congo': 'COD', 'congo dr': 'COD', 'd.r. congo': 'COD',
 'democratic republic of congo': 'COD', 'dr of congo': 'COD',
 'uzbekistan': 'UZB', 'colombia': 'COL', 'england': 'ENG', 'croatia': 'CRO',
 'ghana': 'GHA', 'panama': 'PAN',
}

def norm_team(name):
    """Map a free-text team name to our 3-letter code, or None."""
    if not name:
        return None
    k = re.sub(r'[^a-z ]', '', name.lower().replace('-', ' ').replace('.', '')).strip()
    k = re.sub(r'\s+', ' ', k)
    if k in _ALIASES:
        return _ALIASES[k]
    for alias, code in _ALIASES.items():
        if k.startswith(alias) or alias.startswith(k) and len(k) > 4:
            return code
    return None

def frac_to_dec(s):
    """'7/2' -> 4.5; '11' -> 12.0 (fractional); 'EVS' -> 2.0; None on junk."""
    if s is None:
        return None
    s = str(s).strip().replace(' ', '')
    if not s or s in ('-', 'SP'):
        return None
    if s.upper() in ('EVS', 'EVENS'):
        return 2.0
    if '/' in s:
        try:
            n, d = s.split('/')
            n, d = float(n), float(d)
            return n / d + 1 if d else None
        except ValueError:
            return None
    try:
        v = float(s)
    except ValueError:
        return None
    # bare numbers on oddschecker are fractional (e.g. "11" = 11/1)
    return v + 1

def http_json(url, method='GET', body=None, headers=None, retries=3, timeout=30):
    h = dict(UA)
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        h['Content-Type'] = 'application/json'
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, method=method, headers=h, data=data)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f'http_json failed for {url}: {last}')

def save_raw(name, obj):
    with open(os.path.join(RAW, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f)

def save_cache(name, obj):
    obj = dict(obj)
    obj['fetched_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    with open(os.path.join(CACHE, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=1)
    return obj

def load_cache(name):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding='utf-8'))
