"""One-command runner for the WC2026 betting pipeline.

Usage:
  python run_pipeline.py                 # full run: model -> fetch -> analyze -> report
  python run_pipeline.py --offline      # reuse cached odds, re-analyze + report only
  python run_pipeline.py --skip-oc      # skip the slow Oddschecker scrape (exchanges only)
  python run_pipeline.py --skip-model   # reuse existing 200k-sim model files

Outputs: out/analysis.json, out/RECOMMENDATIONS.md, out/RECOMMENDATIONS.pdf
"""
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
args = set(sys.argv[1:])


def run(cmd, cwd=HERE, env=None, check=True):
    print(f'\n>>> {" ".join(cmd)}', flush=True)
    e = dict(os.environ)
    if env:
        e.update(env)
    r = subprocess.run(cmd, cwd=cwd, env=e)
    if check and r.returncode != 0:
        print(f'STEP FAILED ({r.returncode}): {" ".join(cmd)}', file=sys.stderr)
        sys.exit(r.returncode)
    return r.returncode


t0 = time.time()

# 1. model (200k sims, both variants, joint order distribution)
if '--skip-model' not in args and '--offline' not in args:
    run([sys.executable, 'sim.py', os.path.join('betting', 'model_anchored.json')],
        cwd=BASE, env={'SIM_N': '200000', 'SIM_JOINT': '1'})
    run([sys.executable, 'sim.py', os.path.join('betting', 'model_independent.json')],
        cwd=BASE, env={'SIM_N': '200000', 'SIM_JOINT': '1', 'SIM_NO_MARKET': '1'})

# 2. odds
if '--offline' not in args:
    run([sys.executable, 'fetch_exchanges.py'], check=False)
    if '--skip-oc' not in args:
        # headed Chrome; reuse anything scraped in the last 90 minutes
        run(['node', 'fetch_oddschecker.js'], check=False,
            env={'OC_MAX_AGE_MIN': os.environ.get('OC_MAX_AGE_MIN', '90')})

# 3. analyze + tests + report
run([sys.executable, 'analyze.py'])
run([sys.executable, '-m', 'pytest', 'tests', '-q'])
run([sys.executable, 'build_recs.py'])

print(f'\nPipeline complete in {time.time() - t0:.0f}s — see betting/out/')
