"""Hämtar Augustpriset (skönlitterär bok) från svenska Wikipedia och skriver data-august.json.
Körs: python3 verktyg/hamta_august.py <cache-mapp>"""
import json, re, sys, os, datetime, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hamta

def slug(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def lank(text):
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", text)
    return (m.group(1).strip(), (m.group(2) or m.group(1)).strip()) if m else (None, text.strip())

# Manuellt kontrollerade fall där pronomenräkningen var osäker (belägg ur artikeln)
KON_BELAGG = {
    "Elin Cullhed": ("kvinna", "Hon är gift med författaren Gunnar Ardelius"),
    "Linnea Axelsson": ("kvinna", "Hon disputerade 2009 vid Umeå universitet"),
    "Tony Samuelsson": ("man", "Hans författarskap anknyter till arbetarlitteraturen"),
    "Torbjörn Flygt": ("man", "…han Augustpriset för romanen Underdog"),
}

def kon(txt):
    """Gissar kön från pronomen i artikelns början. Returnerar (kön, säker?)."""
    brod = re.sub(r"\{\{.*?\}\}|<ref.*?</ref>|<ref[^>]*/>", "", txt, flags=re.S)
    brod = brod[:6000].lower()
    hon = len(re.findall(r"\b(hon|hennes)\b", brod))
    han = len(re.findall(r"\b(han|hans|honom)\b", brod))
    if hon > 2 * han and hon >= 2:
        return "kvinna", True
    if han > 2 * hon and han >= 2:
        return "man", True
    return ("kvinna" if hon > han else "man"), False

if __name__ == "__main__":
    hamta.CACHE = sys.argv[1]
    txt = hamta.raw("Augustpriset")
    lista = txt.split("==Pristagare==")[1].split("==Bildgalleri==")[0]
    poster = []
    ar = None
    for rad in lista.split("\n"):
        m = re.match(r";\s*(?:\[\[Litteraturåret (\d{4})|\{\{ar\|[Ll]itteratur\|(\d{4})\}\})", rad)
        if m:
            ar = int(m.group(1) or m.group(2))
            continue
        m = re.match(r"\*\s*(Skönlitterär bok|Vinnare)\s*:\s*(.*)", rad)
        if not m or ar is None or ar < 1990:
            continue
        rest = re.sub(r"<ref.*?</ref>|<ref[^>]*/>", "", m.group(2))
        forf = re.match(r"\s*(\[\[[^\]]+\]\])\s*[,:]?\s*(.*)", rest)
        forf_del, titel_del = forf.group(1), forf.group(2)
        k = re.search(r"''(.*?)''", titel_del)
        titel_wiki = k.group(1) if k else re.search(r"(\[\[[^\]]+\]\])", titel_del).group(1)
        titel_artikel, titel = lank(titel_wiki) if "[[" in titel_wiki else (None, titel_wiki)
        hel_titel = titel.strip()
        titel = re.split(r"\.\s+(?=[A-ZÅÄÖ])|\s+-\s+|:\s+", hel_titel)[0].strip()
        artikel, namn = lank(forf_del)
        osakert = []
        if m.group(1) == "Vinnare":
            osakert.append("kategori: före 1992 delades bara ett Augustpris ut – boken räknas här som skönlitterär")
        if titel != hel_titel:
            osakert.append(f"titel: förkortad i spelet, hela titeln är ”{hel_titel}”")
        poster.append({"år": ar, "namn": namn, "artikel": artikel, "titel": titel.strip(), "titel_artikel": titel_artikel,
                       "osäkert": osakert})
    print(len(poster), "vinnare", file=sys.stderr)
    for p in poster:
        if p["artikel"]:
            final, t = hamta.resolve(p["artikel"])
            p["artikel"] = final
            p["artikellängd"] = len(t.encode("utf-8"))
            p["kön"], saker = kon(t)
            if p["namn"] in KON_BELAGG:
                p["kön"], saker = KON_BELAGG[p["namn"]][0], True
            if not saker:
                p["osäkert"].append(f"kön: osäkert, gissat {p['kön']} utifrån artikeltexten")
        else:
            p["artikellängd"] = 0
            p["kön"] = "okänt"
            p["osäkert"].append("artikel: författaren saknar artikel på svenska Wikipedia")
        print(p["år"], p["namn"], p["kön"], p["artikellängd"], file=sys.stderr)
    # Två nivåer efter artikellängd: längre artikel = mer känd = nivå 1
    ordnade = sorted(poster, key=lambda p: -p["artikellängd"])
    for i, p in enumerate(ordnade):
        p["nivå"] = 1 if i < (len(ordnade) + 1) // 2 else 2
    antal = {}
    for p in poster:
        antal[p["namn"]] = antal.get(p["namn"], 0) + 1
    ut = []
    for p in sorted(poster, key=lambda p: p["år"]):
        ut.append({
            "id": "aug-" + str(p["år"]) + "-" + slug(p["namn"]), "namn": p["namn"], "efternamn": p["namn"].split(" ")[-1],
            "år": p["år"], "verk": p["titel"], "kön": p["kön"], "land": [], "språk": [],
            "artikel": p["artikel"] or "", "artikellängd": p["artikellängd"], "nivå": p["nivå"],
            "flerfaldig": antal[p["namn"]] > 1, "osäkert": p["osäkert"],
        })
    data = {
        "version": datetime.date.today().isoformat(), "hämtad": datetime.date.today().isoformat(),
        "källa": "Svenska Wikipedia: ”Augustpriset” och respektive författares artikel",
        "senasteÅr": max(p["år"] for p in ut), "pristagare": ut, "faktafrågor": [],
    }
    json.dump(data, open(os.path.join(ROT, "data-august.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("flerfaldiga:", sorted({p["namn"] for p in ut if p["flerfaldig"]}), file=sys.stderr)
