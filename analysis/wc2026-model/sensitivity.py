# Sensitivity: re-run sim.py under varied constants, report pick stability
import re, subprocess, json, itertools, collections

src = open('sim.py', encoding='utf-8').read()
variants = {
 'base':        {'SLOPE': 250.0, 'BASE_TOTAL': 2.45, 'MISMATCH_K': 0.25},
 'flat_slope':  {'SLOPE': 300.0, 'BASE_TOTAL': 2.45, 'MISMATCH_K': 0.25},
 'steep_slope': {'SLOPE': 210.0, 'BASE_TOTAL': 2.45, 'MISMATCH_K': 0.25},
 'low_goals':   {'SLOPE': 250.0, 'BASE_TOTAL': 2.25, 'MISMATCH_K': 0.20},
 'high_goals':  {'SLOPE': 250.0, 'BASE_TOTAL': 2.65, 'MISMATCH_K': 0.35},
 'no_market':   {'SLOPE': 250.0, 'BASE_TOTAL': 2.45, 'MISMATCH_K': 0.25, 'NO_MARKET': True},
 'no_condit':   {'SLOPE': 250.0, 'BASE_TOTAL': 2.45, 'MISMATCH_K': 0.25, 'NO_COND': True},
}
picks_by_variant = {}
goals_by_variant = {}
for name, v in variants.items():
    s = src
    s = re.sub(r'N_SIMS = .*', 'N_SIMS = 40_000', s)
    s = re.sub(r'SLOPE = [\d.]+', f"SLOPE = {v['SLOPE']}", s)
    s = re.sub(r'BASE_TOTAL = [\d.]+', f"BASE_TOTAL = {v['BASE_TOTAL']}", s)
    s = re.sub(r'MISMATCH_K = [\d.]+', f"MISMATCH_K = {v['MISMATCH_K']}", s)
    if v.get('NO_MARKET'):
        s = s.replace("MARKET_ADJ.get(code, 0)", "0")
    if v.get('NO_COND'):
        s = s.replace("mods.get(home, 0)", "0").replace("mods.get(away, 0)", "0")
    open('_tmp_sim.py', 'w', encoding='utf-8').write(s)
    subprocess.run(['python', '_tmp_sim.py', f'_out_{name}.json'],
                   capture_output=True, check=True)
    out = json.load(open(f'_out_{name}.json'))
    picks_by_variant[name] = {g: out['picks'][g][0]['pick'] for g in out['picks']}
    goals_by_variant[name] = round(out['tiebreaker']['mean'])
    picks_by_variant[name]['_chosen'] = sorted(out['chosen_groups'])

base = picks_by_variant['base']
print('variant       goals  groups deviating from base picks')
for name in variants:
    devs = [f"{g}:{'-'.join(picks_by_variant[name][g])}"
            for g in base if picks_by_variant[name][g] != base[g]]
    print(f"{name:13s} {goals_by_variant[name]:5d}  {('; '.join(devs)) or 'none'}")

json.dump({'picks': picks_by_variant, 'goals': goals_by_variant},
          open('sensitivity.json', 'w'), indent=1)
