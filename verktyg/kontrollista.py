"""Skriver KONTROLLISTA.md från data.json."""
import json
d = json.load(open("data.json", encoding="utf-8"))
ps = d["pristagare"]
rader = ["# Kontrollista", "",
         "Allt nedan finns också i appen under **Kontroll**, där du kan rätta och godkänna direkt i telefonen.", ""]
def avsnitt(rubrik, prefix, beskr):
    rader.extend([f"## {rubrik}", "", beskr, ""])
    for p in ps:
        noter = [o.split(": ", 1)[1] for o in p["osäkert"] if o.startswith(prefix)]
        if noter:
            rader.append(f"- **{p['namn']}** ({p['år']}) – land: {', '.join(p['land'])} · språk: {', '.join(p['språk'])} · verk: *{p.get('verk') or '–'}*")
            rader.extend(f"  - {n}" for n in noter)
    rader.append("")
avsnitt("Känt verk – osäkra val", "verk:", "Artikeln pekar inte tydligt ut ett huvudverk. Föreslaget verk står efter \"verk:\".")
avsnitt("Språk", "språk:", "Pristagare med flera språk (alla räknas som rätt i spelet) eller där källorna skiljer sig.")
avsnitt("Land", "land:", "Pristagare med flera länder (alla räknas som rätt) eller historiska landsnamn.")
a = json.load(open("data-august.json", encoding="utf-8"))
rader += ["## Augustpriset (årets skönlitterära bok)", "",
          f"{len(a['pristagare'])} vinnare 1990–{a['senasteÅr']}. Kön är bestämt utifrån pronomen i författarens artikel; osäkra fall är kontrollerade för hand.", ""]
for p in a["pristagare"]:
    if p["osäkert"]:
        rader.append(f"- **{p['namn']}** ({p['år']}) – *{p['verk']}* · {p['kön']}")
        rader.extend(f"  - {o}" for o in p["osäkert"])
rader.append("")
rader += ["## Faktafrågor", "", f"{len(d['faktafrågor'])} frågor. Varje fråga har ett citat ur artikeln som belägg – läs dem i appen under Kontroll → Faktafrågor.", ""]
open("KONTROLLISTA.md", "w", encoding="utf-8").write("\n".join(rader))
