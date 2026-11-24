# Nobelquiz

Ett litet quizspel för att lära sig alla nobelpristagare i litteratur (1901–2026).
Fungerar i mobilen, även utan internet, och kan läggas på hemskärmen.

## Vad finns här?

| Fil | Vad den gör |
|---|---|
| `index.html` | Själva sidan som öppnas |
| `app.js` | Spelet: frågor, Leitner-repetition, nivåer, statistik, kontrollista |
| `stil.css` | Utseendet (stora knappar, mörkt läge) |
| `data.json` | **All fakta**: pristagare, nivåer och faktafrågor med källa |
| `sw.js` | Gör att appen fungerar offline |
| `manifest.webmanifest`, `ikoner/` | Gör att appen kan läggas på hemskärmen |
| `verktyg/` | Programmen som hämtade datan från svenska Wikipedia (behövs inte i mobilen) |

## Så fungerar spelet

- **Nivåer:** de 123 pristagarna är sorterade efter hur lång deras artikel på svenska Wikipedia är.
  Längst artikel = mest känd = nivå 1. Cirka 25 per nivå.
- **Upplåsning:** nästa nivå öppnas när 70 % av personerna på nivån är *lärda*.
  En person är lärd när alla dess fakta (år, land, språk, verk) har nått fack 3.
- **Leitner:** varje fakta ligger i ett fack 1–5. Rätt svar flyttar upp ett fack, fel svar flyttar
  tillbaka till fack 1. Fack 1 kommer tillbaka efter 10 minuter (och fel svar dyker upp igen i
  samma runda), fack 2 efter 1 dag, fack 3 efter 3 dagar, fack 4 efter 7 dagar, fack 5 efter 14 dagar.
- **Flera rätta svar:** har en pristagare flera länder eller språk räknas alla som rätt. Väljer
  man bara en del blir det "Nästan" – helt rätt är att välja alla.
- **Kontrollista:** under *Kontroll* finns alla osäkra uppgifter och alla faktafrågor med citat ur
  artikeln. Där kan man rätta, godkänna och stänga av frågor. Allt sparas i telefonen.

## Uppdatera datan (för den som vill)

```
python3 verktyg/hamta.py /tmp/wiki          # hämtar artiklarna
python3 verktyg/bygg_data.py grund /tmp/wiki
python3 verktyg/bygg_data.py klar /tmp/wiki  # skriver data.json
```
