import sys, json, types, runpy, os
_sequence = 0
def _request(operation, value, timeout=10000):
    global _sequence
    _sequence += 1
    sys.stdout.write('\n\x1ePTERM ' + json.dumps(dict(seq=_sequence, operation=operation, value=value, timeout=timeout)) + '\n')
    sys.stdout.flush()
    response = json.loads(sys.stdin.readline())
    if response.get('seq') != _sequence or response.get('error'):
        raise RuntimeError(response.get('error', 'Invalid pTerm response'))
    return response.get('value')
pterm = types.ModuleType('pterm')
pterm.send = lambda text: _request('send', text)
pterm.expect = lambda text, timeout=10000: _request('expect', text, timeout)
pterm.sleep = lambda milliseconds: _request('sleep', milliseconds)
sys.modules['pterm'] = pterm
sys.argv = sys.argv[1:]
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
runpy.run_path(sys.argv[0], run_name='__main__')
