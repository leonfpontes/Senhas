"""Sincroniza docs/plano-benchmark-2026-10.md com o board GiraHub no Trello.

Uso:  source ~/.trello_env && python3 scripts/trello_sync_backlog.py [--dry]
Credenciais (TRELLO_KEY/TRELLO_TOKEN) ficam só em ~/.trello_env (chmod 600), nunca no repo.
Atualiza cards pelo ID do título (ex.: "V-01 — "), cria os que faltam, recria checklists e ordena pelo ranking.
"""
import os, re, sys, json, time, urllib.request, urllib.parse
DRY = "--dry" in sys.argv
KEY, TOKEN = os.environ["TRELLO_KEY"], os.environ["TRELLO_TOKEN"]
BOARD = "6ac5803333fea237a73ce787"
DOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "plano-benchmark-2026-10.md")

def api(method, path, **params):
    params.update(key=KEY, token=TOKEN)
    req = urllib.request.Request(f"https://api.trello.com/1{path}?" + urllib.parse.urlencode(params), method=method)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req) as r:
                time.sleep(0.11); return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(3 * (attempt + 1)); continue
            raise RuntimeError(f"{method} {path}: {e.code} {e.read()[:300]}")

text = open(DOC, encoding="utf-8").read()
DOD = [l[6:].strip() for l in re.search(r"### Definição de pronto.*?\n((?:- \[ \].*\n)+)", text).group(1).strip().splitlines()]
ID_RE = r"([VNFCTXIP$]-\d\d)"
cards = []
for block in re.split(r"\n(?=## |### )", text):
    m = re.match(rf"### {ID_RE} — (.+)", block)
    if not m: continue
    lines = block.splitlines()[1:]
    meta = {}
    for l in lines:
        if l.startswith("- **Ranking:**") or l.startswith("- **Depende de:**"):
            for k, v in re.findall(r"\*\*(.+?):\*\* ([^·]+)", l): meta[k.strip()] = v.strip()
    body = [l for l in lines if not (l.startswith("- **Ranking:**") or l.startswith("- **Depende de:**") or l.startswith("- [ ]") or l.strip() == "**Aceite**")]
    cards.append(dict(id=m.group(1), title=m.group(2).strip(), meta=meta,
                      checks=[l[6:].strip() for l in lines if l.startswith("- [ ]")], body="\n".join(body).strip()))

rank_table = {}
for m in re.finditer(rf"^\| (\d+) \| {ID_RE} .*\| (To Do|Backlog|Decisões) \|$", text, re.M):
    rank_table[m.group(2)] = (int(m.group(1)), m.group(3))
errs = []
for c in cards:
    r, lst = rank_table.get(c["id"], (None, None))
    c["list"] = lst
    if r is None or int(c["meta"]["Ranking"]) != r: errs.append(f"{c['id']} ranking mismatch {r} vs {c['meta'].get('Ranking')}")
    for k in ["Ranking", "Prioridade", "Onda", "Esforço", "Tipo", "Módulo", "Épico", "Depende de", "Destrava"]:
        if k not in c["meta"]: errs.append(f"{c['id']} sem {k}")
    if not c["checks"]: errs.append(f"{c['id']} sem aceite")
print(len(cards), "cards;", len(rank_table), "no ranking;", "erros:", errs or "nenhum")
mods = sorted({c["meta"]["Módulo"] for c in cards}); print("módulos:", mods)
print("épicos:", sorted({c["meta"]["Épico"] for c in cards}))
def desc(c):
    m = c["meta"]
    head = (f"**Ranking #{m['Ranking']}** · **{m['Prioridade']}** · Onda {m['Onda']} · Esforço {m['Esforço']} · Tipo: {m['Tipo']}\n"
            f"**Módulo:** {m['Módulo']} · **Épico:** {m['Épico']}\n"
            f"**Depende de:** {m['Depende de']} · **Destrava:** {m['Destrava']}\n\n---\n\n")
    tail = "\n\n---\nFonte da verdade: `docs/plano-benchmark-2026-10.md` (edite lá e re-sincronize). Benchmark: `docs/benchmark-concorrentes-2026-10.md`. B/ = backend/src/, F/ = frontend/src/."
    return head + c["body"] + tail
print("maior descrição:", max(len(desc(c)) for c in cards))
if DRY: sys.exit(1 if errs else 0)
assert not errs

# ---- labels
labels = {l["name"]: l for l in api("GET", f"/boards/{BOARD}/labels", limit=1000)}
def ensure(name, color, old=None):
    if old and old in labels and name not in labels:
        api("PUT", f"/labels/{labels[old]['id']}", name=name, color=color); labels[name] = labels.pop(old); return labels[name]["id"]
    if name in labels:
        if labels[name]["color"] != color: api("PUT", f"/labels/{labels[name]['id']}", color=color)
        return labels[name]["id"]
    labels[name] = api("POST", "/labels", name=name, color=color, idBoard=BOARD); return labels[name]["id"]
L = {}
for ep, col in {"Vitrine": "blue", "Planos": "green", "Núcleo": "orange", "Funcionalidade": "purple", "Crescimento": "yellow", "Fundação": "sky"}.items():
    L["ep:" + ep] = ensure(f"Épico: {ep}", col, old=ep)
for p, txt, col in [("P0", "agora", "red_dark"), ("P1", "próximo", "orange_dark"), ("P2", "depois", "yellow_dark"), ("P3", "futuro", "lime_dark")]:
    L[p] = ensure(f"{p} · {txt}", col, old=p)
L["Decisão"] = ensure("Tipo: Decisão", "red", old="Decisão")
L["Conteúdo"] = ensure("Tipo: Conteúdo", "green_light", old="Conteúdo")
L["Infra"] = ensure("Tipo: Infra", "black", old=None)
MODCOL = {"Landing & Marketing": "blue_dark", "Planos & Assinatura": "green_dark", "Senhas & Porta": "orange_light", "Consulentes": "pink_dark",
          "Médiuns & Corrente": "purple_dark", "Financeiro": "lime", "Site & SEO": "sky_dark", "Comunicação": "pink",
          "Conta & Segurança": "black_dark", "Giras & Agenda": "blue_light", "Infra & Plataforma": "black_light"}
for mname in mods: L["mod:" + mname] = ensure(f"Módulo: {mname}", MODCOL.get(mname, "purple_light"))

# ---- lists
lists = {l["name"]: l["id"] for l in api("GET", f"/boards/{BOARD}/lists")}
existing = {}
for card in api("GET", f"/boards/{BOARD}/cards", fields="name"):
    m = re.search(rf"{ID_RE} — ", card["name"])
    if m: existing[m.group(1)] = card["id"]

for c in sorted(cards, key=lambda c: int(c["meta"]["Ranking"])):
    m = c["meta"]; r = int(m["Ranking"])
    labs = [L["ep:" + m["Épico"]], L[m["Prioridade"]], L["mod:" + m["Módulo"]]]
    t = m["Tipo"].lower()
    if "decisão" in t: labs.append(L["Decisão"])
    if "conteúdo" in t: labs.append(L["Conteúdo"])
    if "infra" in t: labs.append(L["Infra"])
    fields = dict(name=f"[{r:02d}] {c['id']} — {c['title']}", desc=desc(c), idList=lists[c["list"]], pos=r * 1000, idLabels=",".join(labs))
    if c["id"] in existing:
        cid = existing[c["id"]]; api("PUT", f"/cards/{cid}", **fields)
        for cl in api("GET", f"/cards/{cid}/checklists"): api("DELETE", f"/checklists/{cl['id']}")
        act = "upd"
    else:
        cid = api("POST", "/cards", **fields)["id"]; act = "new"
    groups = [("Aceite", c["checks"])] + ([("Definição de pronto", DOD)] if "dev" in t else [])
    for gname, items in groups:
        cl = api("POST", "/checklists", idCard=cid, name=gname, pos="bottom")
        for it in items: api("POST", f"/checklists/{cl['id']}/checkItems", name=it, pos="bottom")
    print(act, r, c["id"], flush=True)
stale = set(existing) - {c["id"] for c in cards}
print("cards no Trello sem correspondência no doc:", stale or "nenhum")
print("FIM")
