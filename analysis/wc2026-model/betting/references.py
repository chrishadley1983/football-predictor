"""External reference probabilities (fractions 0-1) used for corroboration tiers.

OPTA_ADV  — Opta supercomputer advance-to-R32 %, theanalyst.com, runs 1-4 Jun 2026
OPTA_WIN  — Opta win-group % (published for favourites + selected others)
ESPN_ADV  — ESPN Elo-based model advance %, espn.com pick-through, ~4 Jun 2026
DK_WIN    — DraftKings group-winner odds 5 Jun 2026, proportionally devigged
All collected 9 Jun 2026 during the research sweep (see research notes in tournament PDF).
"""

OPTA_ADV = {
 'MEX': .872, 'KOR': .701, 'CZE': .642, 'RSA': .489, 'SUI': .854, 'CAN': .798,
 'BIH': .626, 'QAT': .435, 'BRA': .969, 'MAR': .887, 'SCO': .656, 'HAI': .158,
 'USA': .770, 'TUR': .730, 'PAR': .643, 'AUS': .588, 'GER': .961, 'ECU': .869,
 'CIV': .642, 'CUW': .190, 'NED': .882, 'JPN': .762, 'SWE': .626, 'TUN': .434,
 'BEL': .896, 'EGY': .682, 'IRN': .643, 'NZL': .478, 'ESP': .985, 'URU': .843,
 'KSA': .399, 'CPV': .329, 'FRA': .953, 'NOR': .823, 'SEN': .620, 'IRQ': .271,
 'ARG': .967, 'AUT': .674, 'ALG': .571, 'JOR': .409, 'POR': .949, 'COL': .849,
 'COD': .221, 'UZB': .221, 'ENG': .930, 'CRO': .769, 'GHA': .495, 'PAN': .400,
}

OPTA_WIN = {
 'MEX': .480, 'KOR': .224, 'CZE': .184, 'SUI': .421, 'CAN': .317, 'BIH': .173,
 'QAT': .089, 'BRA': .602, 'MAR': .286, 'USA': .324, 'GER': .599, 'NED': .482,
 'BEL': .519, 'EGY': .203, 'ESP': .756, 'URU': .189, 'FRA': .603, 'NOR': .252,
 'ARG': .720, 'POR': .590, 'ENG': .675, 'HAI': .011,
}

ESPN_ADV = {
 'MEX': .95, 'KOR': .77, 'CZE': .60, 'RSA': .35, 'SUI': .94, 'CAN': .94,
 'BIH': .46, 'QAT': .29, 'BRA': .97, 'MAR': .91, 'SCO': .66, 'HAI': .16,
 'USA': .78, 'TUR': .73, 'AUS': .64, 'PAR': .58, 'GER': .97, 'ECU': .92,
 'CIV': .79, 'CUW': .09, 'NED': .92, 'JPN': .90, 'SWE': .49, 'TUN': .36,
 'BEL': .88, 'IRN': .74, 'EGY': .67, 'NZL': .41, 'ESP': .99, 'URU': .86,
 'KSA': .36, 'CPV': .34, 'FRA': .95, 'SEN': .83, 'NOR': .72, 'IRQ': .20,
 'ARG': .98, 'AUT': .65, 'ALG': .64, 'JOR': .35, 'POR': .89, 'COL': .90,
 'UZB': .52, 'COD': .35, 'ENG': .97, 'CRO': .90, 'PAN': .46, 'GHA': .28,
}

_DK_AMERICAN = {
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

def _amer(o):
    return (-o) / (-o + 100) if o < 0 else 100 / (o + 100)

DK_WIN = {}
for _g, _odds in _DK_AMERICAN.items():
    _raw = {c: _amer(o) for c, o in _odds.items()}
    _s = sum(_raw.values())
    for _c in _raw:
        DK_WIN[_c] = _raw[_c] / _s
