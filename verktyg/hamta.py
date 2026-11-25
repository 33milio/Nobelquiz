"""Hämtar pristagare från svenska Wikipedia och sparar råtext lokalt.
Körs: python3 verktyg/hamta.py <mapp för cache>"""
import json, re, sys, time, urllib.request, urllib.error, urllib.parse, os

UA = "NobelQuizPersonal/0.1 (https://github.com/33milio/nobelquiz)"
CACHE = sys.argv[1]
os.makedirs(CACHE, exist_ok=True)

def raw(title):
    fn = os.path.join(CACHE, title.replace("/", "_") + ".txt")
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    url = "https://sv.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            txt = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
            if "<title>Wikimedia Error</title>" in txt or txt.startswith("You are making too many"):
                raise IOError("rate limited")
            open(fn, "w", encoding="utf-8").write(txt)
            time.sleep(1.5)
            return txt
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None  # sidan finns inte
            wait = 5 * (attempt + 1)
            print(f"  försök {attempt+1} misslyckades för {title}: {e}; väntar {wait}s", file=sys.stderr)
            time.sleep(wait)
        except Exception as e:
            wait = 5 * (attempt + 1)
            print(f"  försök {attempt+1} misslyckades för {title}: {e}; väntar {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit("Gav upp: " + title)

def resolve(title):
    """Följer omdirigeringar. Returnerar (slutlig titel, text)."""
    for _ in range(3):
        txt = raw(title)
        if txt is None:
            return title, None
        m = re.match(r"\s*#(?:OMDIRIGERING|REDIRECT)\s*\[\[([^\]|#]+)", txt, re.I)
        if not m:
            return title, txt
        title = m.group(1).strip()
    return title, txt

if __name__ == "__main__":
    main = raw("Nobelpriset i litteratur")
    table = main.split("== Kronologisk lista över pristagare ==")[1].split("\n|}")[0]
    rows = table.split("\n|-")[1:]
    laureates = []
    year = None
    for r in rows:
        text = r.strip()
        if not text or text.startswith("!"):
            continue
        # Dela upp celler: antingen "||" på en rad eller en cell per rad
        lines = [l for l in text.split("\n") if l.strip()]
        cells = []
        for l in lines:
            l = l[1:] if l.startswith("|") else l
            cells += [c.strip() for c in l.split("||")]
        ym = re.search(r"\[\[Litteraturåret (\d{4})", cells[0])
        if ym:
            year = int(ym.group(1))
            cells = cells[1:]
        if any("Inget pris" in c for c in cells):
            continue
        # Hitta pristagarcellen: första cell med en länk som inte är en bild
        idx = next((i for i, c in enumerate(cells)
                    if re.search(r"\[\[(?!Fil:|File:|Litteraturåret)", c)), None)
        if idx is None:
            print("PROBLEM", year, cells[:4], file=sys.stderr)
            continue
        who, land, lang, motiv = (cells[idx:] + [""] * 4)[:4]
        nm = re.search(r"\[\[(?!Fil:|File:)([^\]|]+)(?:\|([^\]]+))?\]\]", who)
        laureates.append({
            "år": year,
            "artikel_länk": nm.group(1).strip(),
            "visningsnamn": (nm.group(2) or nm.group(1)).strip(),
            "cell_namn": who, "cell_land": land, "cell_språk": lang, "motivering": motiv,
        })
    print(len(laureates), "pristagare i tabellen", file=sys.stderr)
    for i, l in enumerate(laureates):
        final, txt = resolve(l["artikel_länk"])
        l["artikel"] = final
        l["artikellängd"] = len(txt.encode("utf-8"))
        print(f"{i+1}/{len(laureates)} {l['år']} {final}: {l['artikellängd']} byte", file=sys.stderr)
    json.dump(laureates, open(os.path.join(CACHE, "_tabell.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
