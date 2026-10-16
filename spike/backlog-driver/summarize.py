import json,sys
for l in open(sys.argv[1]):
    try: e=json.loads(l)
    except: print("RAW",l[:200]); continue
    t=e.get('type')
    if t=='assistant':
        for c in e['message']['content']:
            if c['type']=='tool_use': print('TOOL_USE',c['name'],json.dumps(c['input'])[:160])
            elif c['type']=='text': print('TEXT',c['text'][:1200])
    elif t=='user':
        for c in e['message']['content'] if isinstance(e['message']['content'],list) else []:
            if c.get('type')=='tool_result': print('RESULT',str(c.get('content'))[:160].replace('\n',' '), 'is_error=',c.get('is_error'))
    elif t=='result': print('FINAL', {k:e.get(k) for k in ('subtype','is_error','num_turns','permission_denials','total_cost_usd','stop_reason','duration_ms')})
    elif t=='system' and e.get('subtype')=='init': print('INIT AskUserQuestion in tools:', 'AskUserQuestion' in e.get('tools',[]), 'session', e.get('session_id'), 'plugins', [p.get('name') for p in e.get('plugins',[])])
