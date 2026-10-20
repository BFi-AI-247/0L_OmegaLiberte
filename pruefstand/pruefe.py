#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Test bench (Prüfstand): checks every source through the same api/rss.php the app uses.

Start the reference locally first:   php -S 127.0.0.1:8099 -t reference/web
Then:                                python3 pruefstand/pruefe.py pruefstand/lists/de-sources.txt
                                     python3 pruefstand/pruefe.py catalogs/de-starter.json

Input
  .txt   one source per line:  address | label   (Bluesky: bsky:<handle>, Mastodon: @name@instance,
         YouTube: https://www.youtube.com/@handle, anything else: website or feed URL)
  .json  a source pack (formats/source-pack.md, format 0l.source-pack/1)
Output   a Markdown table on stdout; exit code 1 if anything failed and --strict is given.
Server   PRUEFSTAND_API (default http://127.0.0.1:8099/api/rss.php)

Taken from KOMPASS tools/pruefe.py (reference instance Kompass~OmegaLiberte), extended for source packs and Mastodon."""
import json, os, sys, urllib.parse, urllib.request

API = os.environ.get('PRUEFSTAND_API', 'http://127.0.0.1:8099/api/rss.php')

def holen(url, kopf=None, t=45):
    req = urllib.request.Request(url, headers=dict({'User-Agent': 'OmegaLiberte-Pruefstand/1'}, **(kopf or {})))
    try:
        with urllib.request.urlopen(req, timeout=t) as r: return json.loads(r.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        try: return json.loads(e.read().decode('utf-8', 'replace'))
        except Exception: return {'status': 'fehler', 'meldung': 'HTTP %d' % e.code}
    except Exception as e: return {'status': 'fehler', 'meldung': str(e)[:80]}

def rss(aktion, url): return holen(API + '?aktion=' + aktion + '&url=' + urllib.parse.quote(url, safe=''), {'Sec-Fetch-Site': 'same-origin'})

def eintraege_lesen(pfad):
    """→ list of (address, label)"""
    if pfad.endswith('.json'):
        pack = json.load(open(pfad, encoding='utf-8'))
        if not str(pack.get('format', '')).startswith('0l.source-pack/'): sys.exit('%s is not a 0l.source-pack' % pfad)
        aus = []
        for s in pack.get('sources', []):
            k, name = s.get('kind'), s.get('title') or ''
            if k == 'bluesky': aus.append(('bsky:' + s.get('handle', '').lstrip('@'), name))
            elif k == 'mastodon': aus.append((s.get('handle', ''), name))
            elif s.get('url'): aus.append((s['url'], name))
        return aus
    aus = []
    for z in open(pfad, encoding='utf-8'):
        z = z.strip()
        if not z or z.startswith('#'): continue
        adr, _, name = [x.strip() for x in z.partition('|')]
        aus.append((adr, name or adr))
    return aus

def pruefen(adr, name):
    if adr.startswith('bsky:'):
        h = adr[5:]
        d = holen('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + urllib.parse.quote(h))
        if d.get('handle'): return (name, '✅ Bluesky · ' + (d.get('displayName') or ''), '@' + d['handle'], str(d.get('postsCount', '?')) + ' posts', '–')
        return (name, '❌ Bluesky: ' + str(d.get('message') or d.get('meldung') or 'not found')[:60], h, '–', '–')
    if adr.startswith('@') and adr.count('@') == 2:
        user, inst = adr[1:].split('@')
        d = holen('https://' + inst + '/api/v1/accounts/lookup?acct=' + urllib.parse.quote(user))
        if d.get('acct'): return (name, '✅ Mastodon · ' + (d.get('display_name') or ''), adr, str(d.get('statuses_count', '?')) + ' posts', (d.get('last_status_at') or '–')[:10])
        return (name, '❌ Mastodon: ' + str(d.get('error') or d.get('meldung') or 'not found')[:60], adr, '–', '–')
    f = rss('finden', adr)
    gef = [g for g in f.get('gefunden', []) if 'comment' not in g.get('url', '').lower()] if f.get('status') == 'ok' else []
    if not gef: return (name, '❌ ' + str(f.get('meldung') or f.get('status') or 'no feed')[:70], adr, '–', '–')
    feed = gef[0]['url']
    d = rss('feed', feed); e = d.get('eintraege') or []
    if d.get('status') == 'ok' and e:
        neu = max((x.get('datum') or '') for x in e)[:10]
        med = sum(1 for x in e if x.get('medien') or x.get('video'))
        return (name, '✅ ' + (d.get('titel') or f.get('name') or '')[:50], feed, '%d (%d audio/video)' % (len(e), med), neu)
    return (name, '❌ Feed: ' + str(d.get('meldung') or 'empty')[:60], feed, '–', '–')

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    zeilen = [pruefen(a, n) for a, n in eintraege_lesen(args[0] if args else 'pruefstand/lists/de-sources.txt')]
    print('| Label | Result | Address | Items | newest |')
    print('|---|---|---|---|---|')
    for z in zeilen: print('| ' + ' | '.join(x.replace('|', '/') for x in z) + ' |')
    ok = sum(1 for z in zeilen if z[1].startswith('✅'))
    print()
    print('%d of %d confirmed.' % (ok, len(zeilen)))
    if '--strict' in sys.argv and ok < len(zeilen): sys.exit(1)
