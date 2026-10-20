# curation (v1)
What an AI returns when asked to select from unread items (see [prompts/curator.md](../prompts/curator.md)).
```json
{
  "headline": "short headline of the day (optional, ≤ 90 chars)",
  "hint": "one sentence if the person's wish cannot be met with their sources (optional)",
  "topics": [ { "topic": "…", "sentence": "one factual sentence", "ids": ["b1", "b7"], "lead": "b1" } ],
  "picks":  [ { "id": "b1", "why": "≤ 12 words", "weight": 2, "also": ["b9"] } ]
}
```
- Item ids are short local aliases (`b1` … `bN`) assigned by the instance; the AI never sees personal data.
- `also`: other items telling the same story (shown together, not picked separately). `weight` 1–3 optional.
- Reference instance note: the German implementation uses `lage/auswahl/thema/satz/warum/gewicht/auch/ueberschrift/hinweis/leit` — same meaning.
