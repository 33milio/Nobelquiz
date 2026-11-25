"""Bygger appens datafil data.json från de hämtade Wikipedia-sidorna.

Steg 1 (grund):   python3 verktyg/bygg_data.py grund <cache-mapp>
                  -> verktyg/grund.json (tabellens uppgifter + artikellängd)
Steg 2 (färdig):  python3 verktyg/bygg_data.py klar <cache-mapp>
                  -> data.json (grund + verk, extra språk och faktafrågor från verktyg/berikning/*.json)
"""
import json, re, sys, os, glob, unicodedata, datetime

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[2]

# Historiska eller förkortade landsnamn i tabellen -> namn i spelet
LAND = {
    "Tyskland|kejsardömet": ("Tyskland", "Tabellen anger Kejsardömet Tyskland"),
    "Weimarrepubliken": ("Tyskland", "Tabellen anger Weimarrepubliken"),
    "Västtyskland": ("Tyskland", "Tabellen anger Västtyskland"),
    "Storbritannien och Irland": ("Storbritannien", "Tabellen anger Storbritannien och Irland"),
    "Indien|Brittisk": ("Indien", "Tabellen anger Brittiska Indien"),
    "TAN": ("Tanzania", None),
    "SFR Jugoslavien": ("Jugoslavien", "Tabellen anger SFR Jugoslavien"),
    "USA|1912": ("USA", None),
}
SPRAK = {"Nygrekiska": ("Grekiska", "Tabellen anger nygrekiska")}
EFTERNAMN = {
    "Han Kang": "Han", "Mo Yan": "Mo", "Gao Xingjian": "Gao",
    "Gabriel García Márquez": "García Márquez", "Mario Vargas Llosa": "Vargas Llosa",
    "Jean-Marie Gustave Le Clézio": "Le Clézio", "Roger Martin du Gard": "Martin du Gard",
    "Verner von Heidenstam": "Heidenstam", "Saint-John Perse": "Perse",
}

def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ø", "o").replace("ł", "l")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def sida(titel):
    for _ in range(3):
        txt = open(os.path.join(CACHE, titel.replace("/", "_") + ".txt"), encoding="utf-8").read()
        m = re.match(r"\s*#(?:OMDIRIGERING|REDIRECT)\s*\[\[([^\]|#]+)", txt, re.I)
        if not m:
            return txt
        titel = m.group(1).strip()
    return txt

def rensa_wiki(s):
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def grund():
    tab = json.load(open(os.path.join(CACHE, "_tabell.json"), encoding="utf-8"))
    huvud = sida("Nobelpriset i litteratur")
    kvinnorad = re.search(r"Nitton av pristagarna har varit kvinnor:(.*?)<ref", huvud).group(1)
    kvinnor = set(re.findall(r"\[\[([^\]|]+)", kvinnorad))
    ut = []
    for t in tab:
        osakert = []
        namn = re.sub(r"\s*\(.*?\)$", "", t["artikel"]).strip()
        alias = sorted({t["visningsnamn"], t["artikel_länk"]} - {namn})
        land = []
        for m in re.findall(r"\{\{\s*[Ff]laggbild2\s*\|([^}]+)\}\}", t["cell_land"]):
            nyckel = m.strip()
            nytt, not_ = LAND.get(nyckel, LAND.get(nyckel.split("|")[0], (nyckel.split("|")[0].strip(), None)))
            if not_:
                osakert.append(f"land: {not_} – i spelet: {nytt}")
            if nytt not in land:
                land.append(nytt)
        if "exil" in t["cell_land"]:
            osakert.append("land: tabellen anger Sovjetunionen (i exil)")
        sprak = []
        for m in re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", t["cell_språk"]):
            s = m.strip()[0].upper() + m.strip()[1:]
            s, not_ = SPRAK.get(s, (s, None))
            if not_:
                osakert.append(f"språk: {not_} – i spelet: {s}")
            if s not in sprak:
                sprak.append(s)
        if len(land) > 1:
            osakert.append(f"land: flera länder ({', '.join(land)}) – alla räknas som rätt")
        if len(sprak) > 1:
            osakert.append(f"språk: flera språk ({', '.join(sprak)}) – alla räknas som rätt")
        txt = sida(t["artikel"])
        # Jämför med faktarutans språk
        m = re.search(r"^\s*\|\s*språk\s*=(.*)$", txt, re.M)
        if m:
            ib = [x.strip().capitalize() for x in re.split(r",|/| och ", rensa_wiki(m.group(1))) if x.strip()]
            ib = [x for x in ib if len(x) > 3 and not any(s.lower() in x.lower() for s in sprak)]
            if ib:
                osakert.append(f"språk: faktarutan på författarsidan anger också {', '.join(ib)}")
        # Kända verk i faktarutan (tas som förslag; agenten väljer slutligt)
        m = re.search(r"^\s*\|\s*noterbara_verk\s*=(.*)$", txt, re.M)
        ib_verk = rensa_wiki(m.group(1)) if m else ""
        kurs = re.findall(r"''\[\[(?:[^\]|]+\|)?([^\]]+)\]\]''|''([^'\[]+)''", t["motivering"])
        motiv_verk = [a or b for a, b in kurs]
        ut.append({
            "id": slug(namn), "namn": namn, "alias": alias, "efternamn": EFTERNAMN.get(namn, namn.split(" ")[-1]),
            "år": t["år"], "land": land, "språk": sprak,
            "kön": "kvinna" if (t["artikel_länk"] in kvinnor or namn in kvinnor or t["artikel"] in kvinnor) else "man",
            "postumt": "postumt" in t["cell_namn"],
            "artikel": t["artikel"], "artikellängd": t["artikellängd"],
            "motivering": rensa_wiki(t["motivering"]).strip("”\"“ "),
            "faktaruta_verk": ib_verk, "motivering_verk": motiv_verk,
            "osäkert": osakert,
        })
    # Nivåer efter artikellängd: längst = mest känd = nivå 1
    ordnade = sorted(ut, key=lambda p: -p["artikellängd"])
    n = len(ordnade)
    for i, p in enumerate(ordnade):
        p["nivå"] = min(5, i * 5 // n + 1)
    antal_kvinnor = sum(p["kön"] == "kvinna" for p in ut)
    print(f"{n} pristagare, {antal_kvinnor} kvinnor", file=sys.stderr)
    json.dump(ut, open(os.path.join(ROT, "verktyg", "grund.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

def extra_fragor(avd, namn, ids):
    """Läser verktyg/extra-fragor/<avd>-*.json ("Vem …?"- och kopplingsfrågor) och kontrollerar dem."""
    ut = []
    for fn in sorted(glob.glob(os.path.join(ROT, "verktyg", "extra-fragor", f"{avd}-*.json"))):
        bas = os.path.basename(fn)[:-5]
        for i, f in enumerate(json.load(open(fn, encoding="utf-8"))):
            fel = [x for x in f["fel"] if x != f["svar"]][:3]
            if f["svar"] not in namn or len(fel) < 3 or any(x not in namn for x in fel) or f.get("person") not in ids:
                print("  hoppar över ogiltig fråga:", bas, f.get("fråga", "")[:60], file=sys.stderr)
                continue
            ut.append({"id": f"{bas}-{i+1}", "fråga": f["fråga"], "svar": f["svar"], "fel": fel,
                       "förklaring": f.get("förklaring", ""), "citat": f.get("citat", ""), "källa": f.get("källa", ""),
                       "person": f["person"], "personer": [x for x in f.get("personer", []) if x in ids],
                       "typ": f.get("typ", "vem")})
    return ut

def klar():
    ps = json.load(open(os.path.join(ROT, "verktyg", "grund.json"), encoding="utf-8"))
    pid = {p["id"]: p for p in ps}
    fragor = []
    for fn in sorted(glob.glob(os.path.join(ROT, "verktyg", "berikning", "*.json"))):
        for b in json.load(open(fn, encoding="utf-8")):
            if b.get("id") == "_huvudartikel":
                kalla = "Nobelpriset i litteratur"
                person = None
            else:
                p = pid[b["id"]]
                kalla = p["artikel"]
                person = p["id"]
                p["verk"] = b.get("verk") or None
                if b.get("verk_original") and b["verk_original"] != p["verk"]:
                    p["verk_original"] = b["verk_original"]
                p["verk_källa"] = b.get("verk_källa", "")
                if not p["verk"]:
                    p["osäkert"].append("verk: inget känt verk hittades i artikeln")
                elif b.get("verk_säkerhet") != "säker":
                    p["osäkert"].append("verk: " + (b.get("verk_kommentar") or "osäkert val"))
                for s in b.get("fler_språk") or []:
                    s = s.strip().capitalize()
                    if s and s not in p["språk"]:
                        p["osäkert"].append(f"språk: artikeln säger att personen även skrev på {s.lower()}"
                                            + (f" ({b['språk_kommentar']})" if b.get("språk_kommentar") else "")
                                            + " – tillagt, ta bort om du inte håller med")
                        p["språk"].append(s)
            for i, f in enumerate(b.get("frågor", [])):
                fel = [x for x in f["fel"] if x.strip().lower() != f["svar"].strip().lower()]
                fragor.append({
                    "id": f"{b['id'].strip('_')}-{i+1}", "fråga": f["fråga"], "svar": f["svar"], "fel": fel[:3],
                    "förklaring": f.get("förklaring", ""), "citat": f.get("citat", ""),
                    "källa": kalla, "person": person,
                })
    fragor += extra_fragor("nobel", {p["namn"] for p in ps}, {p["id"] for p in ps})
    for p in ps:
        for k in ("faktaruta_verk", "motivering_verk"):
            p.pop(k, None)
        # Osäkerheter om flera språk/länder är info, inte fel – behåll dem i listan ändå
    data = {
        "version": datetime.date.today().isoformat(),
        "hämtad": datetime.date.today().isoformat(),
        "källa": "Svenska Wikipedia: ”Nobelpriset i litteratur” och respektive författares artikel",
        "senasteÅr": max(p["år"] for p in ps),
        "pristagare": sorted(ps, key=lambda p: (p["år"], p["namn"])),
        "faktafrågor": fragor,
    }
    json.dump(data, open(os.path.join(ROT, "data.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(ps)} pristagare, {len(fragor)} faktafrågor, "
          f"{sum(1 for p in ps if p['osäkert'])} med osäkerheter", file=sys.stderr)

if __name__ == "__main__":
    {"grund": grund, "klar": klar}[sys.argv[1]]()
