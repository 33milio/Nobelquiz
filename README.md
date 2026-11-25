# Nobelquiz

Ett litet quizspel för att lära sig alla nobelpristagare i litteratur (1901–2026).
Fungerar i mobilen, även utan internet, och kan läggas på hemskärmen.

## Vad finns här?

| Fil | Vad den gör |
|---|---|
| `index.html` | Själva sidan som öppnas |
| `app.js` | Spelet: frågor, Leitner-repetition, nivåer, statistik, kontrollista |
| `stil.css` | Utseendet (stora knappar, mörkt läge) |
| `data.json` | **All fakta om Nobelpriset**: pristagare, nivåer och faktafrågor med källa |
| `data-august.json` | **Augustpriset**, årets skönlitterära bok: namn, kön, år, titel och nivå |
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
- **Svårt / Bra / Lätt (som i Anki):** efter ett rätt svar väljer man hur lätt det var.
  *Bra* = vanligt steg upp ett fack. *Lätt* = två fack upp (även vid extraövning), så sådant man
  redan kan kommer tillbaka sällan; ett nytt kort som markeras Lätt hamnar direkt i fack 3 (lärt).
  *Svårt* = stannar i samma fack och kommer tillbaka tidigare (i fack 1: igen i samma runda).
  Under varje knapp står när frågan kommer tillbaka. Fel svar skickar som förut tillbaka till fack 1.
  Gäller alla frågetyper, även skrivfrågor, flerval med flera rätta och de kluriga frågorna
  (som har egna kort; de påverkar inte vilka personer som räknas som lärda).
- **Flera rätta svar:** har en pristagare flera länder eller språk räknas alla som rätt. Väljer
  man bara en del blir det "Nästan" – helt rätt är att välja alla.
- **Kontrollista:** under *Kontroll* finns alla osäkra uppgifter och alla faktafrågor med citat ur
  artikeln. Där kan man rätta, godkänna och stänga av frågor. Allt sparas i telefonen.

## Augustpriset

Fliken *Augustpriset* överst på startsidan är en egen avdelning med två nivåer (sorterade efter
artikellängd på svenska Wikipedia) och egna framsteg. Där övas årtal och titel, plus kluriga frågor
(kvinnliga pristagare, tidsordning, initialer, vem som vunnit två gånger). Med från 1992, då
kategorin infördes, samt 1990–1991 då priset bara hade en kategori men gick till romaner.

## Uppdatera datan (för den som vill)

```
python3 verktyg/hamta.py /tmp/wiki          # hämtar artiklarna
python3 verktyg/bygg_data.py grund /tmp/wiki
python3 verktyg/bygg_data.py klar /tmp/wiki  # skriver data.json
python3 verktyg/hamta_august.py /tmp/wiki    # skriver data-august.json
python3 verktyg/kontrollista.py              # skriver KONTROLLISTA.md
```
