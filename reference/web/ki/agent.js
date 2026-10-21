// SPDX-License-Identifier: AGPL-3.0-only
// KI – Dialog und Faktencheck am Beitrag, Seitenleiste „KI & Faktencheck“. Besitzer: KI-Modus.
// Teil von KOMPASS. Alle Dateien teilen sich einen globalen Namensraum (klassische Skripte); Ladereihenfolge: index.html.

/* ---------- Agent (ai.php) ------------------------------------------- */
// Gegenstand des Dialogs: Bezug des Modus (Lage, Thema) oder der aktuelle Beitrag
function chatGegenstand() {
  const bz = modusChatBezug();
  if (bz) return { quelle: bz.quelle || '', titel: bz.titel || '', text: bz.text || '', link: '' };
  const c = cur(); if (!c) return {};
  return { quelle: c.who + (c.handle ? ' (' + c.handle + ')' : ''), titel: c.title || (c.card && c.card.title) || '', text: c.text + (c.card ? '\n\nVerlinkt: ' + (c.card.title || '') + ' ' + c.card.url + (c.card.desc ? ' – ' + c.card.desc : '') : ''), link: (c.card && c.card.url) || c.link };
}
// Art des Gegenstands: 'beitrag' | 'thema' | 'lage' (ohne Bezug des Modus: Pseudo-Einträge der KI erkennen)
function chatArt() {
  const bz = modusChatBezug(); if (bz) return bz.art || 'beitrag';
  const c = cur();
  return c && c.service === 'ki' ? (c.id === lageId() ? 'lage' : 'thema') : 'beitrag';
}
async function askAgent(frage, verlauf, lauf) {
  const beitrag = chatGegenstand();
  if (KI.art() !== 'kompass' && KI.bereit()) {
    try {
      const antwort = await kiDialog(frage, verlauf, beitrag, lauf);
      return antwort ? { status: 'ok', antwort } : { status: 'fehler', antwort: tt('Deine KI hat leer geantwortet.') };
    } catch (e) { return { status: 'fehler', antwort: e.message || tt('Deine KI ist gerade nicht erreichbar.') }; }
  }
  try {
    const r = await fetch('api/ai.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frage, verlauf: verlauf || [], beitrag })
    });
    if (r.status === 404) return { status: 'aus', antwort: tt('Der Dialog ist noch nicht freigeschaltet. Er geht live, sobald {betreiber} den Agenten (ai.php) freigibt.').replace('{betreiber}', INSTANZ.betreiber[LANG] || INSTANZ.betreiber.de) };
    const d = await r.json();
    return d;
  } catch (e) {
    return { status: 'fehler', antwort: tt('Der Agent ist gerade nicht erreichbar.') };
  }
}
async function chat(q) {
  q = String(q || '').trim(); if (!q) return;
  const verlauf = [];
  for (let i = 0; i + 1 < S.msgs.length; i += 2) if (S.msgs[i].who === 'du' && S.msgs[i + 1].who === 'agent') verlauf.push({ frage: S.msgs[i].text, antwort: S.msgs[i + 1].text });
  S.chatOpen = true; S.factOpen = false; S.overview = false; S.draft = '';
  if (isWide() && cur()) { S.assistPin = true; S.assistPinId = cur().id; }
  S.msgs.push({ who: 'du', text: q }, { who: 'agent', text: tt('Denke nach …'), wait: true });
  render();
  const id = S.stack[S.pos];
  const d = await askAgent(q, verlauf, 'dialog');
  if (S.stack[S.pos] !== id) return;
  S.msgs[S.msgs.length - 1] = { who: 'agent', text: d.antwort || tt('Keine Antwort erhalten.') };
  render();
}
async function factCheck() {
  const c = cur(); if (!c || (S.checks[c.id] && S.checks[c.id].state === 'run')) return;
  if (c.service === 'ki' || chatArt() !== 'beitrag') { flash(tt('Der Faktencheck prüft einzelne Beiträge – öffne zuerst einen Beitrag.')); return; }
  S.checks[c.id] = { state: 'run' }; if (isWide()) { S.assistPin = true; S.assistPinId = c.id; } render();
  const d = await askAgent('Prüfe die Kernaussagen dieses Beitrags knapp: Was ist belegt, was ist fraglich, was ist Meinung, Satire oder Humor (Witz, Comedy, Ironie, Unterhaltung)? ' +
    'Beende die Antwort mit genau einer Zeile „Urteil: bestätigt“, „Urteil: fraglich“, „Urteil: irreführend“, „Urteil: Satire/Humor“ oder „Urteil: nicht prüfbar“.', [], 'fakt');
  if (d.status !== 'ok') { S.checks[c.id] = { state: 'fehler', text: d.antwort }; render(); return; }
  const m = /Urteil:\s*([^\n.]+)/i.exec(d.antwort || '');
  const u = m ? m[1].toLowerCase() : '';
  const status = u.includes('bestätigt') ? 'gruen' : (u.includes('irreführend') || u.includes('falsch')) ? 'rot' : (u.includes('satire') || u.includes('humor')) ? 'satire' : 'offen';
  S.checks[c.id] = { state: 'done', status, text: d.antwort, at: Date.now(), by: KI.name() };
  save('checks'); render();
}

function renderAssist() {
  const c = cur(); const chk = c ? S.checks[c.id] : null;
  // KI-Bühne: im Mosaik spricht der Chat über die Lage, im Thema über das Thema – Faktencheck nur am einzelnen Beitrag
  const bezug = chatArt();
  if (bezug !== 'beitrag') return renderAssistKi(c, bezug);
  const fact = FACT[chk && chk.state === 'done' ? chk.status : 'grau'];
  const input = h('input', { id: 'k-chat', placeholder: c ? tt('Frag deinen Agenten …  ( / )') : tt('Kein Beitrag ausgewählt'), value: S.draft, autocomplete: 'off', disabled: !c,
    onInput: (e) => { S.draft = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') chat(S.draft); } });
  const msgs = h('div', { class: 'msgs' }, S.msgs.length ? S.msgs.map((m) => h('div', { class: 'msg ' + m.who + (m.wait ? ' wait' : '') }, m.wait ? kiLaufAnzeige('dialog', m.text) : m.text))
    : h('p', { class: 'small msgs-empty' }, c ? tt('Frag nach Hintergründen, Begriffen oder der Gegenseite. Die Frage geht mit diesem Beitrag an deinen Agenten.') : ''));
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 0);
  const rail = h('button', { type: 'button', class: 'assist-rail', 'aria-label': tt('KI und Faktencheck öffnen'), 'aria-expanded': S.assistPin ? 'true' : 'false',
    onClick: () => { const on = !(S.assistPin && c && S.assistPinId === c.id); S.assistPin = on; S.assistPinId = c && c.id; render(); } },
    h('span', { class: 'ai-spark' }, '✦'), h('span', { class: 'dot', style: 'background:' + fact.color }),
    h('span', { class: 'rail-label' }, tt('KI & Faktencheck')), S.msgs.length ? icon('chat', { sm: true }) : null);
  return [rail, h('div', { class: 'assist-full' },
    h('section', { class: 'assist-fact', 'aria-label': tt('Faktencheck') },
      h('div', { class: 'assist-head' }, h('b', {}, tt('Faktencheck')),
        S.assistPin ? h('button', { type: 'button', class: 'ghost assist-close', 'aria-label': tt('KI-Leiste einklappen'), title: tt('Einklappen (Esc)'), onClick: () => { S.assistPin = false; render(); } }, icon('close', { sm: true })) : null,
        h('span', { class: 'fact-state' }, h('span', { class: 'dot', style: 'background:' + fact.color }), chk && chk.state === 'run' ? kiLaufAnzeige('fakt', tt('läuft …')) : fact.label)),
      h('div', { class: 'small' }, tt('Kontakte: noch keine geteilten Prüfungen · Gemeinschaft: kommt mit der Sammelstelle')),
      chk && (chk.state === 'done' || chk.state === 'fehler') ? h('div', { class: 'note fact-note' }, chk.text + (chk.by ? '\n\n— ' + chk.by : '')) : null,
      h('button', { type: 'button', class: 'btn primary', disabled: !c || (chk && chk.state === 'run'), title: tt('Taste f'), onClick: factCheck },
        chk && chk.state === 'done' ? tt('Erneut prüfen lassen') : tt('Meine KI prüfen lassen'))),
    h('section', { class: 'assist-chat', 'aria-label': tt('Dialog zum Beitrag') },
      h('div', { class: 'assist-head' }, h('b', {}, tt('Dialog zum Beitrag')), h('span', { class: 'small assist-who' }, c ? ((S.entries[c.whoKey] || {}).name || c.who) : '')),
      msgs,
      h('div', { class: 'assist-suggest' }, ['Worum geht’s?', tt('Stimmt das?'), tt('Was sagt die Gegenseite?')].map((t) => h('button', { type: 'button', disabled: !c, onClick: () => chat(t) }, t))),
      h('div', { class: 'composer' }, h('label', { for: 'k-chat', class: 'sr' }, tt('Frage zum Beitrag')), input,
        h('button', { type: 'button', 'aria-label': tt('Senden'), disabled: !c, onClick: () => chat(S.draft) }, icon('send')))),
    kibAuchFeld(c))];
}
function renderAssistKi(c, bezug) {
  const lage = bezug === 'lage';
  const input = h('input', { id: 'k-chat', placeholder: (lage ? tt('Frag nach der Lage …') : tt('Frag nach dem Thema …')) + '  ( / )', value: S.draft, autocomplete: 'off',
    onInput: (e) => { S.draft = e.target.value; }, onKeydown: (e) => { if (e.key === 'Enter') chat(S.draft); } });
  const msgs = h('div', { class: 'msgs' }, S.msgs.length ? S.msgs.map((m) => h('div', { class: 'msg ' + m.who + (m.wait ? ' wait' : '') }, m.wait ? kiLaufAnzeige('dialog', m.text) : m.text))
    : h('p', { class: 'small msgs-empty' }, lage ? tt('Frag nach den Themen des Tages. Die KI kennt nur, was deine Quellen berichten.')
      : tt('Frag nach Hintergründen oder danach, wer wie berichtet. Die Frage geht mit allen Beiträgen dieses Themas an deine KI.')));
  setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 0);
  const vorschlaege = lage ? ['Was ist heute wichtig?', tt('Was ist neu seit gestern?'), tt('Worüber berichten viele?')] : ['Worum geht’s?', tt('Wer berichtet wie?'), tt('Was ist umstritten?')];
  return [h('div', { class: 'assist-rail', 'aria-hidden': 'true' }), h('div', { class: 'assist-full' },
    h('section', { class: 'assist-fact', 'aria-label': tt('Faktencheck') },
      h('div', { class: 'assist-head' }, h('b', {}, tt('Faktencheck')), h('span', { class: 'fact-state' }, h('span', { class: 'dot', style: 'background:' + FACT.grau.color }), tt('am Beitrag'))),
      h('div', { class: 'small' }, tt('Der Faktencheck prüft einzelne Beiträge. Öffne einen Beitrag, dann „Meine KI prüfen lassen“ (Taste f).'))),
    h('section', { class: 'assist-chat', 'aria-label': lage ? tt('Dialog zur Lage') : tt('Dialog zum Thema') },
      h('div', { class: 'assist-head' }, h('b', {}, lage ? tt('Dialog zur Lage') : tt('Dialog zum Thema')), h('span', { class: 'small assist-who' }, lage ? 'KI-Auswahl' : ((modusChatBezug() || {}).titel || c.title))),
      msgs,
      h('div', { class: 'assist-suggest' }, vorschlaege.map((t) => h('button', { type: 'button', onClick: () => chat(t) }, t))),
      h('div', { class: 'composer' }, h('label', { for: 'k-chat', class: 'sr' }, lage ? tt('Frage zur Lage') : tt('Frage zum Thema')), input,
        h('button', { type: 'button', 'aria-label': tt('Senden'), onClick: () => chat(S.draft) }, icon('send')))))];
}
