/* Nobelquiz – allt spelande sker här. Ingen internet behövs efter första laddningen. */
'use strict';

// ---------- Inställningar ----------
const FRAGOR_PER_RUNDA = 15;
const NYA_PERSONER_PER_RUNDA = 3;
const UPPLASNING_ANDEL = 0.7;      // 70 % av nivån måste vara "lärd"
const LARD_FACK = 3;               // fack 3 av 5 = lärd
const DAG = 24 * 60 * 60 * 1000;
// Hur länge man väntar innan ett kort kommer tillbaka (per fack)
const VANTETID = { 1: 10 * 60 * 1000, 2: 1 * DAG, 3: 3 * DAG, 4: 7 * DAG, 5: 14 * DAG };
// Två avdelningar som delar samma spelmotor men har egen data och egna framsteg
const SAMLINGAR = {
  nobel: {
    nyckel: 'nobel', fil: 'data.json', lagring: 'nobelquiz.v1', flik: 'Nobelpriset',
    titel: 'Nobelquiz', underrubrik: år => `Nobelpriset i litteratur 1901–${år}`,
    pris: 'Nobelpriset i litteratur', nivaer: 5, fakta: ['år', 'land', 'språk', 'verk'], verkOrd: 'verk',
  },
  august: {
    nyckel: 'august', fil: 'data-august.json', lagring: 'nobelquiz.august.v1', flik: 'Augustpriset',
    titel: 'Augustpriset', underrubrik: år => `Årets svenska skönlitterära bok 1990–${år}`,
    pris: 'Augustpriset', nivaer: 2, fakta: ['år', 'verk'], verkOrd: 'bok',
  },
};
let S = SAMLINGAR.nobel;
const VALD_SAMLING = 'nobelquiz.samling';

// ---------- Hjälpfunktioner ----------
const $ = (sel, rot = document) => rot.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slump = arr => arr[Math.floor(Math.random() * arr.length)];
const blanda = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const unika = arr => [...new Set(arr)];
const lista = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' och ' + arr[arr.length - 1];
const normalisera = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ł/g, 'l').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function levenshtein(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const nastan = (svar, mal) => {
  const a = normalisera(svar), b = normalisera(mal);
  if (!a || !b) return false;
  return a === b || levenshtein(a, b) <= Math.max(1, Math.floor(b.length / 6));
};

// ---------- Lagring ----------
function nyttTillstand() {
  return { kort: {}, godkanda: {}, andringar: {}, borttagnaFakta: {}, godkandaFakta: {}, typStat: {}, dagar: {}, lardaPersoner: {} };
}
let T = nyttTillstand();
function ladda() {
  T = nyttTillstand();
  try { const s = localStorage.getItem(S.lagring); if (s) T = Object.assign(nyttTillstand(), JSON.parse(s)); } catch (e) { /* tom start */ }
}
function spara() {
  try { localStorage.setItem(S.lagring, JSON.stringify(T)); } catch (e) { /* lagring ej möjlig */ }
}

// ---------- Data ----------
let DATA, P = [], PID = {}, NIVAER = [];
function personMedAndringar(p) {
  const a = T.andringar[p.id];
  return a ? Object.assign({}, p, a) : p;
}
function byggData() {
  P = DATA.pristagare.map(personMedAndringar);
  PID = Object.fromEntries(P.map(p => [p.id, p]));
  NIVAER = nivaLista().map(n => P.filter(p => p.nivå === n));
}
const nivaLista = () => Array.from({ length: S.nivaer }, (_, i) => i + 1);
const faktaFragor = () => DATA.faktafrågor.filter(f => !T.borttagnaFakta[f.id]);
const visaLand = p => lista(p.land);
const visaSprak = p => lista(p.språk);
const efternamn = p => p.efternamn || p.namn.split(' ').slice(-1)[0];

// ---------- Leitner ----------
function kortId(pid, typ) { return pid + '|' + typ; }
function harFakta(p, typ) { return typ !== 'verk' || !!p.verk; }
function kortFor(p) { return S.fakta.filter(t => harFakta(p, t)).map(t => kortId(p.id, t)); }
function personFack(p) {
  const k = kortFor(p).map(id => (T.kort[id] && T.kort[id].fack) || 0);
  return Math.min(...k);
}
const arLard = p => personFack(p) >= LARD_FACK;
function nivaStatus(n) {
  const ps = NIVAER[n - 1];
  const larda = ps.filter(arLard).length;
  const paborjade = ps.filter(p => kortFor(p).some(id => T.kort[id])).length;
  return { totalt: ps.length, larda, paborjade, andel: ps.length ? larda / ps.length : 0 };
}
function upplasta() {
  // En nivå som en gång låsts upp förblir upplåst
  let hogsta = T.hogstaNiva || 1;
  while (hogsta < S.nivaer && nivaStatus(hogsta).andel >= UPPLASNING_ANDEL) hogsta++;
  if (hogsta !== T.hogstaNiva) { T.hogstaNiva = hogsta; spara(); }
  return Array.from({ length: hogsta }, (_, i) => i + 1);
}
function registrera(id, resultat, ovning) {
  // resultat: 'ratt' | 'delvis' | 'fel'
  const nu = Date.now();
  const k = T.kort[id] || { fack: 0, ratt: 0, fel: 0, delvis: 0, nasta: 0 };
  if (resultat === 'ratt') {
    k.ratt++;
    if (!ovning || k.fack === 0) k.fack = Math.min(5, Math.max(1, k.fack + 1));
  } else if (resultat === 'delvis') {
    k.delvis = (k.delvis || 0) + 1;
    k.fack = Math.max(1, k.fack);
  } else {
    k.fel++;
    k.fack = 1;
  }
  if (!ovning || resultat !== 'ratt') k.nasta = nu + VANTETID[k.fack] - (k.fack > 1 ? 2 * 60 * 60 * 1000 : 0);
  k.senast = nu;
  T.kort[id] = k;
}
function noteraTyp(typ, resultat) {
  const s = T.typStat[typ] || { ratt: 0, fel: 0, delvis: 0 };
  s[resultat]++;
  T.typStat[typ] = s;
  const dag = new Date().toISOString().slice(0, 10);
  const d = T.dagar[dag] || { ratt: 0, fel: 0, delvis: 0 };
  d[resultat]++;
  T.dagar[dag] = d;
}

// ---------- Välja felalternativ ----------
function likhet(a, b) {
  let s = Math.random() * 2;
  if (a.språk.some(x => b.språk.includes(x))) s += 2;
  if (a.land.some(x => b.land.includes(x))) s += 1.5;
  if (Math.abs(a.år - b.år) <= 15) s += 1.5;
  if (Math.abs(a.nivå - b.nivå) <= 1) s += 1;
  return s;
}
function liknandePersoner(p, antal, filter = () => true) {
  return P.filter(q => q.id !== p.id && q.namn !== p.namn && filter(q))
    .map(q => [likhet(p, q), q]).sort((x, y) => y[0] - x[0])
    .slice(0, antal * 3).sort(() => Math.random() - .5).slice(0, antal).map(x => x[1]);
}
function nastanAr(ar, antal, undvik) {
  const ut = new Set();
  let f = 0;
  while (ut.size < antal && f++ < 200) {
    const d = (Math.floor(Math.random() * 14) + 1) * (Math.random() < .5 ? -1 : 1);
    const y = ar + d;
    if (y >= DATA.förstaÅr && y <= DATA.senasteÅr && y !== ar && !undvik.includes(y)) ut.add(y);
  }
  return [...ut];
}
function alternativVarden(falt, korrekta, antal, p) {
  // T.ex. andra länder/språk, viktat mot vanliga och liknande
  const pool = {};
  for (const q of P) for (const v of q[falt]) if (!korrekta.includes(v)) pool[v] = (pool[v] || 0) + 1;
  const kand = Object.keys(pool).map(v => [Math.random() * 3 + Math.log(1 + pool[v]), v]).sort((a, b) => b[0] - a[0]);
  return kand.slice(0, antal).map(x => x[1]);
}

// ---------- Frågebyggare ----------
// En fråga: { typ, rubrik, text, tips, läge: 'ett'|'flera'|'skriv'|'ordning'|'tal',
//   alternativ:[{t, ratt}], ratta:[...], kontroll(svar)->resultat, forklaring, kortId, källa, person }
function arFraga(p) {
  const flera = P.filter(x => x.namn === p.namn).length > 1;
  return flera ? `Vilket år fick ${p.namn} ${S.pris} för ”${p.verk}”?` : `Vilket år fick ${p.namn} ${S.pris}?`;
}
function faktaRad(p) {
  const delar = [esc(p.år), esc(visaLand(p)), esc(visaSprak(p))].filter(Boolean);
  if (p.verk) delar.push(`<i>${esc(p.verk)}</i>`);
  return `<b>${esc(p.namn)}</b> – ${delar.join(' · ')}`;
}
function ettval(rubrik, text, ratt, fel, extra = {}) {
  const alternativ = blanda([{ t: String(ratt), ratt: true }, ...fel.map(f => ({ t: String(f), ratt: false }))]);
  return Object.assign({ rubrik, text, läge: 'ett', alternativ }, extra);
}
function flerval(rubrik, text, ratta, fela, extra = {}) {
  const alternativ = blanda([...ratta.map(t => ({ t, ratt: true })), ...fela.map(t => ({ t, ratt: false }))]);
  return Object.assign({ rubrik, text, läge: 'flera', alternativ, tips: 'Välj alla som stämmer.' }, extra);
}

function fragaForKort(id) {
  if (id.startsWith('fakta|')) return faktaFraga(DATA.faktafrågor.find(f => f.id === id.slice(6)));
  const [pid, typ] = id.split('|');
  const p = PID[pid];
  const fack = (T.kort[id] && T.kort[id].fack) || 0;
  const bakat = Math.random() < .45; // åt andra hållet: fakta → person
  let q;
  if (typ === 'år') {
    const medvinnare = P.filter(x => x.år === p.år && x.id !== p.id);
    if (bakat) {
      q = ettval('Årtal → pristagare', `Vem fick ${S.pris} ${p.år}?`, p.namn,
        liknandePersoner(p, 3, x => x.år !== p.år).map(x => x.namn),
        { tips: medvinnare.length ? 'Priset delades detta år.' : '' });
    } else if (fack >= 3 && Math.random() < .6) {
      q = { rubrik: 'Pristagare → årtal', text: arFraga(p), läge: 'tal', ratta: [p.år],
        tips: 'Skriv årtalet. Inom två år ger halvpoäng.' };
    } else {
      q = ettval('Pristagare → årtal', arFraga(p), p.år, nastanAr(p.år, 3, P.filter(x => x.namn === p.namn).map(x => x.år)));
    }
  } else if (typ === 'land' || typ === 'språk') {
    const falt = typ;
    const varden = p[falt];
    const ord = falt === 'land' ? { fr: 'Vilket land', frFler: 'Vilka länder', av: 'representerade', om: v => `representerade ${v}` }
      : { fr: 'Vilket språk', frFler: 'Vilka språk', av: 'skrev på', om: v => `skrev på ${v.toLowerCase()}` };
    if (bakat) {
      const v = slump(varden);
      const fel = liknandePersoner(p, 3, x => !x[falt].includes(v)).map(x => x.namn);
      q = ettval(falt === 'land' ? 'Land → pristagare' : 'Språk → pristagare',
        `Vilken av dessa pristagare ${ord.om(v)}?`, p.namn, fel);
    } else if (varden.length > 1) {
      q = flerval(falt === 'land' ? 'Pristagare → land' : 'Pristagare → språk',
        falt === 'land' ? `Vilka länder representerade ${p.namn}?` : `På vilka språk skrev ${p.namn}?`,
        varden, alternativVarden(falt, varden, Math.max(2, 5 - varden.length), p));
    } else {
      q = ettval(falt === 'land' ? 'Pristagare → land' : 'Pristagare → språk',
        falt === 'land' ? `Vilket land representerade ${p.namn}?` : `På vilket språk skrev ${p.namn}?`,
        varden[0], alternativVarden(falt, varden, 3, p));
    }
  } else if (typ === 'verk') {
    if (bakat) {
      q = ettval(S.verkOrd === 'bok' ? 'Bok → författare' : 'Verk → författare', `Vem skrev ”${p.verk}”?`, p.namn,
        liknandePersoner(p, 3, x => x.verk && x.verk !== p.verk).map(x => x.namn));
    } else {
      const andraVinster = P.filter(x => x.namn === p.namn && x !== p).map(x => x.verk);
      q = S.verkOrd === 'bok'
        ? ettval('Pristagare → bok', `För vilken bok fick ${p.namn} ${S.pris}${andraVinster.length ? ` ${p.år}` : ''}?`, p.verk,
          liknandePersoner(p, 3, x => x.verk && !andraVinster.includes(x.verk)).map(x => x.verk))
        : ettval('Pristagare → verk', `Vilket verk skrev ${p.namn}?`, p.verk,
          liknandePersoner(p, 3, x => x.verk && x.verk !== p.verk).map(x => x.verk));
    }
  }
  q.kortId = id;
  q.person = p;
  q.statTyp = typ;
  return q;
}
function faktaFraga(f) {
  const q = ettval('Faktafråga', f.fråga, f.svar, f.fel.slice(0, 3));
  q.källa = f.källa;
  q.förklaring = f.förklaring || '';
  q.kortId = 'fakta|' + f.id;
  q.statTyp = 'fakta';
  if (f.person) q.person = PID[f.person];
  return q;
}

// ---------- Kluriga frågor (genereras fritt) ----------
const KLURIGA = [
  function bokstav(ups) {
    // Nämn en pristagare vars efternamn börjar på X (fungerar i båda avdelningarna)
    const p = slump(P.filter(x => ups.includes(x.nivå)));
    const b = normalisera(efternamn(p))[0].toUpperCase();
    const giltiga = unika(P.filter(q => normalisera(efternamn(q))[0].toUpperCase() === b).map(q => q.namn)).map(n => P.find(q => q.namn === n));
    if (giltiga.length > 4) return null;
    return { rubrik: 'Bokstav', läge: 'skriv', text: `Nämn en pristagare vars efternamn börjar på ${b}.`,
      tips: giltiga.length > 1 ? `Det finns ${giltiga.length} möjliga svar.` : 'Det finns ett möjligt svar.', giltiga, statTyp: 'bokstav' };
  },
  function tvaGanger() {
    const namn = unika(P.filter(p => P.filter(q => q.namn === p.namn).length > 1).map(p => p.namn));
    if (!namn.length) return null;
    const n = slump(namn);
    const vinster = P.filter(p => p.namn === n);
    const fel = liknandePersoner(vinster[0], 3, x => P.filter(q => q.namn === x.namn).length === 1).map(x => x.namn);
    const q = ettval('Två gånger', `Vem av dessa har fått ${S.pris} två gånger?`, n, fel, { statTyp: 'två gånger' });
    q.extraFakta = vinster.map(v => `${v.år}: ${v.verk}`);
    return q;
  },
  function landOchBokstav(ups) {
    if (!S.fakta.includes('land')) return null;
    // Nämn en pristagare från X vars efternamn börjar på Y
    const kandidater = P.filter(p => ups.includes(p.nivå));
    for (let f = 0; f < 30; f++) {
      const p = slump(kandidater);
      const land = slump(p.land);
      const bokstav = normalisera(efternamn(p))[0].toUpperCase();
      const giltiga = P.filter(q => q.land.includes(land) && normalisera(efternamn(q))[0].toUpperCase() === bokstav);
      if (!bokstav) continue;
      return {
        rubrik: 'Land + bokstav', läge: 'skriv',
        text: `Nämn en pristagare från ${land} vars efternamn börjar på ${bokstav}.`,
        tips: giltiga.length > 1 ? `Det finns ${giltiga.length} möjliga svar.` : 'Det finns ett möjligt svar.',
        giltiga, statTyp: 'land+bokstav'
      };
    }
  },
  function flersprakiga(ups) {
    if (!S.fakta.includes('språk')) return null;
    const fler = P.filter(p => p.språk.length > 1 && ups.includes(p.nivå) || p.språk.length > 1 && Math.random() < .3);
    if (fler.length < 1) return null;
    if (Math.random() < .5) {
      const p = slump(fler);
      const ovriga = liknandePersoner(p, 3, x => x.språk.length === 1);
      return ettval('Flerspråkiga', `Vem av dessa skrev på både ${lista(p.språk.map(s => s.toLowerCase()))}?`, p.namn,
        ovriga.map(x => x.namn), { person: p, statTyp: 'flerspråkiga' });
    }
    const ratta = blanda(fler).slice(0, Math.min(fler.length, 1 + Math.floor(Math.random() * 2)));
    const fela = blanda(P.filter(p => p.språk.length === 1)).slice(0, 5 - ratta.length);
    const q = flerval('Flerspråkiga', 'Vilka av dessa pristagare skrev på mer än ett språk?', ratta.map(p => p.namn), fela.map(p => p.namn), { statTyp: 'flerspråkiga' });
    q.extraFakta = ratta.map(p => `${p.namn}: ${visaSprak(p)}`);
    return q;
  },
  function sprakGrupp(ups) {
    if (!S.fakta.includes('språk')) return null;
    const sprak = slump(unika(P.filter(p => ups.includes(p.nivå)).flatMap(p => p.språk)));
    const med = P.filter(p => p.språk.includes(sprak));
    const utan = P.filter(p => !p.språk.includes(sprak));
    const ratta = blanda(med).slice(0, Math.min(med.length, 1 + Math.floor(Math.random() * 3)));
    const fela = blanda(utan).slice(0, 5 - ratta.length);
    return flerval('Språkgrupp', `Vilka av dessa skrev på ${sprak.toLowerCase()}?`, ratta.map(p => p.namn), fela.map(p => p.namn), { statTyp: 'språkgrupp' });
  },
  function antalFranLand() {
    if (!S.fakta.includes('land')) return null;
    const räkning = {};
    P.forEach(p => p.land.forEach(l => räkning[l] = (räkning[l] || 0) + 1));
    const land = slump(Object.keys(räkning).filter(l => räkning[l] >= 2));
    const n = räkning[land];
    const fel = unika([n - 2, n - 1, n + 1, n + 2, n + 3, n * 2].filter(x => x > 0 && x !== n));
    return ettval('Räkna', `Hur många pristagare har representerat ${land}?`, n, blanda(fel).slice(0, 3),
      { statTyp: 'räkna', extraFakta: [P.filter(p => p.land.includes(land)).map(p => p.namn).join(', ')] });
  },
  function enda(ups) {
    if (!S.fakta.includes('land')) return null;
    const räkning = {};
    P.forEach(p => p.land.forEach(l => räkning[l] = (räkning[l] || 0) + 1));
    const ensam = Object.keys(räkning).filter(l => räkning[l] === 1 && ups.includes(P.find(x => x.land.includes(l)).nivå));
    if (!ensam.length) return null;
    const land = slump(ensam);
    const p = P.find(x => x.land.includes(land));
    return { rubrik: 'Ensam i sitt land', läge: 'skriv', text: `${land} har bara en pristagare. Vem?`, giltiga: [p], person: p, statTyp: 'ensam' };
  },
  function forst(ups) {
    const val = blanda(P.filter(p => ups.includes(p.nivå)));
    const fyra = [];
    for (const p of val) if (!fyra.some(q => q.år === p.år || q.namn === p.namn)) { fyra.push(p); if (fyra.length === 4) break; }
    const tidigast = fyra.reduce((a, b) => a.år < b.år ? a : b);
    return ettval('Tidslinje', 'Vem av dessa fick priset först?', tidigast.namn, fyra.filter(p => p !== tidigast).map(p => p.namn),
      { statTyp: 'tidslinje', extraFakta: fyra.slice().sort((a, b) => a.år - b.år).map(p => `${p.år}: ${p.namn}`) });
  },
  function ordning(ups) {
    const val = blanda(P.filter(p => ups.includes(p.nivå)));
    const fyra = [];
    for (const p of val) if (!fyra.some(q => Math.abs(q.år - p.år) < 3 || q.namn === p.namn)) { fyra.push(p); if (fyra.length === 4) break; }
    const ratt = fyra.slice().sort((a, b) => a.år - b.år);
    return {
      rubrik: 'Tidslinje', läge: 'ordning', text: 'Tryck på pristagarna i den ordning de fick priset, tidigast först.',
      alternativ: blanda(fyra).map(p => ({ t: p.namn, p })), ratta: ratt.map(p => p.namn),
      extraFakta: ratt.map(p => `${p.år}: ${p.namn}`), statTyp: 'ordning'
    };
  },
  function initialer(ups) {
    // Skrivfråga utan svarsalternativ – annars avslöjar alternativen svaret
    const p = slump(P.filter(x => ups.includes(x.nivå)));
    const init = x => x.namn.split(/[\s.-]+/).filter(Boolean).map(d => d[0].toUpperCase() + '.').join(' ');
    const dec = Math.floor(p.år / 10) * 10;
    // Rätt svar: samma initialer OCH passar ledtråden (årtionde, land)
    const passar = x => init(x) === init(p) && Math.floor(x.år / 10) * 10 === dec &&
      (!p.land || !p.land.length || x.land.some(l => p.land.includes(l)));
    const giltiga = unika(P.filter(passar).map(x => x.namn)).map(n => P.find(x => x.namn === n));
    const ledtrad = [`fick priset under åren ${dec}–${dec + 9}`];
    if (p.land && p.land.length) ledtrad.push(`från ${lista(p.land)}`);
    return { rubrik: 'Initialer', läge: 'skriv', text: `Vilken pristagare har initialerna ${init(p)}?`,
      tips: `Ledtråd: ${ledtrad.join(', ')}.${giltiga.length > 1 ? ` (${giltiga.length} möjliga svar.)` : ''}`,
      giltiga, person: p, statTyp: 'initialer' };
  },
  function kvinna(ups) {
    const kv = P.filter(p => p.kön === 'kvinna');
    if (!S.fakta.includes('språk') && Math.random() < .5) {
      const dec = Math.floor(slump(kv).år / 10) * 10;
      const giltiga = kv.filter(p => Math.floor(p.år / 10) * 10 === dec);
      return { rubrik: 'Kvinnliga pristagare', läge: 'skriv', text: `Nämn en kvinna som fick ${S.pris} under åren ${dec}–${dec + 9}.`,
        giltiga, statTyp: 'kvinnor', tips: giltiga.length > 1 ? `Det finns ${giltiga.length} möjliga svar.` : '' };
    }
    if (S.fakta.includes('språk') && Math.random() < .5) {
      const sprak = slump(unika(kv.flatMap(p => p.språk)));
      const giltiga = kv.filter(p => p.språk.includes(sprak));
      return { rubrik: 'Kvinnliga pristagare', läge: 'skriv', text: `Nämn en kvinnlig pristagare som skrev på ${sprak.toLowerCase()}.`,
        giltiga, statTyp: 'kvinnor', tips: giltiga.length > 1 ? `Det finns ${giltiga.length} möjliga svar.` : '' };
    }
    const p = slump(kv.filter(x => ups.includes(x.nivå)).length ? kv.filter(x => ups.includes(x.nivå)) : kv);
    const fel = liknandePersoner(p, 3, x => x.kön !== 'kvinna');
    return ettval('Kvinnliga pristagare', 'Vem av dessa är kvinna?', p.namn, fel.map(x => x.namn), { person: p, statTyp: 'kvinnor' });
  },
  function delat(ups) {
    const ar = unika(P.map(p => p.år)).filter(y => P.filter(p => p.år === y).length > 1 && P.some(p => p.år === y && ups.includes(p.nivå)));
    if (!ar.length) return null;
    const y = slump(ar);
    const ratta = P.filter(p => p.år === y);
    const fela = liknandePersoner(ratta[0], 3, x => x.år !== y);
    return flerval('Delat pris', `Priset ${y} delades. Mellan vilka?`, ratta.map(p => p.namn), fela.map(p => p.namn), { statTyp: 'delat' });
  },
];
function klurigFraga(ups) {
  for (let f = 0; f < 10; f++) {
    try { const q = slump(KLURIGA)(ups); if (q) { q.klurig = true; return q; } } catch (e) { /* prova en annan */ }
  }
  return null;
}

// ---------- Bygga en runda ----------
function byggRunda() {
  const ups = upplasta();
  const nu = Date.now();
  const personer = P.filter(p => ups.includes(p.nivå));
  const forfallna = [];
  for (const p of personer) for (const id of kortFor(p)) {
    const k = T.kort[id];
    if (k && k.nasta <= nu) forfallna.push([k.fack, k.nasta, id]);
  }
  for (const f of faktaFragor()) {
    const id = 'fakta|' + f.id, k = T.kort[id];
    if (k && k.nasta <= nu && (!f.person || ups.includes(PID[f.person]?.nivå))) forfallna.push([k.fack + .5, k.nasta, id]);
  }
  forfallna.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const valda = [];
  const perPerson = {};
  const lagg = id => {
    const pid = id.split('|')[0];
    if (!id.startsWith('fakta|') && (perPerson[pid] || 0) >= 2) return false; // inte alla fakta om en person varje gång
    if (valda.includes(id)) return false;
    perPerson[pid] = (perPerson[pid] || 0) + 1;
    valda.push(id); return true;
  };
  const platserForKort = FRAGOR_PER_RUNDA - 3; // tre kluriga per runda
  for (const [, , id] of forfallna) { if (valda.length >= platserForKort - 2) break; lagg(id); }

  // Nya personer, från lägsta nivån med opåbörjade
  // Nya personer: varannan från den lägsta och varannan från den högsta upplåsta nivån
  const opaborjade = personer.filter(p => !kortFor(p).some(id => T.kort[id]));
  const lagst = blanda(opaborjade).sort((a, b) => a.nivå - b.nivå);
  const hogst = blanda(opaborjade).sort((a, b) => b.nivå - a.nivå);
  const nya = unika(lagst.flatMap((p, i) => [p, hogst[i]]));
  // Få förfallna kort => fler nya personer (upp till dubbelt så många)
  const maxNya = forfallna.length < 4 ? NYA_PERSONER_PER_RUNDA * 2 : NYA_PERSONER_PER_RUNDA;
  for (const p of nya.slice(0, maxNya)) {
    if (valda.length >= platserForKort) break;
    for (const id of blanda(kortFor(p)).slice(0, 2)) lagg(id);
  }
  // Nya faktafrågor
  const nyaFakta = blanda(faktaFragor().filter(f => !T.kort['fakta|' + f.id] && (!f.person || ups.includes(PID[f.person]?.nivå))));
  for (const f of nyaFakta.slice(0, 2)) if (valda.length < platserForKort) lagg('fakta|' + f.id);

  // Fyll ut med övning av kort som inte är förfallna (räknas inte uppåt i Leitner)
  const ovning = new Set();
  if (valda.length < platserForKort) {
    const startade = blanda(personer.flatMap(p => kortFor(p)).filter(id => T.kort[id] && !valda.includes(id)))
      .sort((a, b) => T.kort[a].fack - T.kort[b].fack);
    for (const id of startade) { if (valda.length >= platserForKort) break; if (lagg(id)) ovning.add(id); }
  }
  const fragor = blanda(valda).map(id => Object.assign(fragaForKort(id), { övning: ovning.has(id) }));
  const antalKluriga = FRAGOR_PER_RUNDA - fragor.length;
  for (let i = 0; i < antalKluriga; i++) {
    const q = klurigFraga(ups);
    if (q) fragor.splice(Math.floor(Math.random() * (fragor.length + 1)), 0, q);
  }
  return fragor;
}

// ---------- Kontroll av svar ----------
function rattaSvar(q, svar) {
  if (q.läge === 'ett') {
    return q.alternativ[svar].ratt ? 'ratt' : 'fel';
  }
  if (q.läge === 'flera') {
    const valda = svar;
    const felval = valda.filter(i => !q.alternativ[i].ratt).length;
    const rattval = valda.filter(i => q.alternativ[i].ratt).length;
    const allaRatt = q.alternativ.filter(a => a.ratt).length;
    if (felval === 0 && rattval === allaRatt) return 'ratt';
    if (felval === 0 && rattval > 0) return 'delvis';
    return 'fel';
  }
  if (q.läge === 'tal') {
    const n = parseInt(svar, 10);
    if (n === q.ratta[0]) return 'ratt';
    if (Math.abs(n - q.ratta[0]) <= 2) return 'delvis';
    return 'fel';
  }
  if (q.läge === 'skriv') {
    const trff = q.giltiga.find(p => nastan(svar, p.namn) || nastan(svar, efternamn(p)) || (p.alias || []).some(a => nastan(svar, a)));
    q.traff = trff;
    return trff ? 'ratt' : 'fel';
  }
  if (q.läge === 'ordning') {
    const ordn = svar.map(i => q.alternativ[i].t);
    const r = ordn.filter((t, i) => t === q.ratta[i]).length;
    return r === q.ratta.length ? 'ratt' : r >= q.ratta.length - 2 && r > 0 ? 'delvis' : 'fel';
  }
}

// ---------- Vyer ----------
const app = () => $('#app');
let runda = null;

function visaHem() {
  runda = null;
  const ups = upplasta();
  const nu = Date.now();
  let forfallna = 0;
  for (const p of P) if (ups.includes(p.nivå)) for (const id of kortFor(p)) if (T.kort[id] && T.kort[id].nasta <= nu) forfallna++;
  const oGodkanda = P.filter(p => p.osäkert && p.osäkert.length && !T.godkanda[p.id]).length;
  const nivaHtml = nivaLista().map(n => {
    const s = nivaStatus(n);
    const last = !ups.includes(n);
    const krav = Math.ceil(UPPLASNING_ANDEL * s.totalt);
    return `<div class="niva ${last ? 'last' : ''}">
      <div class="nr">${last ? '🔒' : n}</div>
      <div class="info">
        <div><b>Nivå ${n}</b> <span class="svag">· ${s.larda}/${s.totalt} lärda</span></div>
        <div class="mätare"><div style="width:${Math.round(s.andel * 100)}%"></div></div>
        ${!last && n < S.nivaer && !ups.includes(n + 1) ? `<div class="svag">Lär dig ${krav} för att låsa upp nivå ${n + 1}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  app().innerHTML = `
    <div class="flikar">${Object.values(SAMLINGAR).map(x =>
      `<button data-samling="${x.nyckel}" class="${x === S ? 'aktiv' : ''}">${esc(x.flik)}</button>`).join('')}</div>
    <h1>${esc(S.titel)}</h1>
    <p class="svag">${esc(S.underrubrik(DATA.senasteÅr))}</p>
    <div class="stapel" style="margin-top:12px">${nivaHtml}</div>
    <div class="botten">
      <p class="svag" style="text-align:center">${forfallna ? `${forfallna} kort väntar på repetition` : 'Inga kort väntar – nya personer står på tur'}</p>
      <button class="primar" id="spela">Spela en runda</button>
      <div class="rad">
        <button class="liten" id="stat">Statistik</button>
        <button class="liten" id="las">Läs på</button>
        <button class="liten" id="kontroll">Kontroll${oGodkanda ? ` <span class="etikett varning">${oGodkanda}</span>` : ''}</button>
      </div>
      <button class="liten" id="mer" style="width:100%">Säkerhetskopia och inställningar</button>
    </div>`;
  $('#spela').onclick = startaRunda;
  app().querySelectorAll('[data-samling]').forEach(b => b.onclick = () => bytSamling(b.dataset.samling));
  $('#stat').onclick = visaStatistik;
  $('#las').onclick = () => visaLasPa(ups[ups.length - 1]);
  $('#kontroll').onclick = () => visaKontroll('uppgifter');
  $('#mer').onclick = visaInstallningar;
}

function startaRunda() {
  runda = { fragor: byggRunda(), i: 0, ratt: 0, fel: 0, delvis: 0, upplastaFore: upplasta().length, missade: [] };
  visaFraga();
}

function visaFraga() {
  const q = runda.fragor[runda.i];
  if (!q) return visaSlut();
  q.valda = [];
  const prog = Math.round(runda.i / runda.fragor.length * 100);
  let svarHtml = '';
  if (q.läge === 'ett' || q.läge === 'flera' || q.läge === 'ordning') {
    svarHtml = `<div class="svar">${q.alternativ.map((a, i) => `<button data-i="${i}">${esc(a.t)}</button>`).join('')}</div>`;
    if (q.läge !== 'ett') svarHtml += `<button class="primar" id="svara" disabled>Svara</button>`;
  } else {
    const tal = q.läge === 'tal';
    svarHtml = `<div class="stapel">
      <input id="inmatning" type="${tal ? 'number' : 'text'}" ${tal ? 'inputmode="numeric" pattern="[0-9]*"' : 'autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false"'} placeholder="${tal ? 'Årtal' : 'Skriv ett namn'}">
      <div class="rad"><button class="liten" id="vetinte">Vet inte</button><button class="primar liten" id="svara">Svara</button></div>
    </div>`;
  }
  app().innerHTML = `
    <div class="topprad">
      <button class="stang liten" id="avbryt" aria-label="Avsluta rundan">✕</button>
      <div class="mätare ratt"><div style="width:${prog}%"></div></div>
      <span class="svag">${runda.i + 1}/${runda.fragor.length}</span>
    </div>
    <div class="fraga">
      <div class="typ">${esc(q.rubrik)}${q.övning ? ' · extraövning' : ''}${q.klurig ? ' · klurig' : ''}</div>
      <div class="text">${esc(q.text)}</div>
      ${q.tips ? `<div class="tips">${esc(q.tips)}</div>` : ''}
    </div>
    <div class="botten" id="svarsyta">${svarHtml}</div>`;
  $('#avbryt').onclick = () => { spara(); visaHem(); };
  const knappar = [...app().querySelectorAll('.svar button')];
  if (q.läge === 'ett') {
    knappar.forEach(b => b.onclick = () => besvara(q, +b.dataset.i));
  } else if (q.läge === 'flera') {
    knappar.forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      q.valda = q.valda.includes(i) ? q.valda.filter(x => x !== i) : [...q.valda, i];
      b.classList.toggle('vald');
      $('#svara').disabled = !q.valda.length;
    });
    $('#svara').onclick = () => besvara(q, q.valda);
  } else if (q.läge === 'ordning') {
    knappar.forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (q.valda.includes(i)) q.valda = q.valda.filter(x => x !== i); else q.valda.push(i);
      knappar.forEach((k, j) => {
        const pos = q.valda.indexOf(j);
        k.classList.toggle('vald', pos >= 0);
        k.innerHTML = (pos >= 0 ? `<span class="ordning">${pos + 1}</span>` : '') + esc(q.alternativ[j].t);
      });
      $('#svara').disabled = q.valda.length !== q.alternativ.length;
    });
    $('#svara').onclick = () => besvara(q, q.valda);
  } else {
    const inp = $('#inmatning');
    const skicka = () => { if (inp.value.trim()) besvara(q, inp.value.trim()); };
    $('#svara').onclick = skicka;
    inp.onkeydown = e => { if (e.key === 'Enter') skicka(); };
    $('#vetinte').onclick = () => besvara(q, '');
    setTimeout(() => inp.focus(), 50);
  }
}

function besvara(q, svar) {
  const res = (svar === '' ? 'fel' : rattaSvar(q, svar));
  runda[res]++;
  if (q.kortId) registrera(q.kortId, res, q.övning);
  noteraTyp(q.statTyp || 'övrigt', res);
  if (res !== 'ratt') runda.missade.push(q);
  // Fel svar kommer tillbaka snart: lägg in samma kort igen några frågor senare
  if (res === 'fel' && q.kortId && !q.igen) {
    const ny = Object.assign(q.kortId.startsWith('fakta|') ? fragaForKort(q.kortId) : fragaForKort(q.kortId), { igen: true, övning: true });
    const pos = Math.min(runda.fragor.length, runda.i + 3 + Math.floor(Math.random() * 3));
    runda.fragor.splice(pos, 0, ny);
  }
  spara();

  // Markera knappar
  const knappar = [...app().querySelectorAll('.svar button')];
  knappar.forEach((b, i) => {
    b.disabled = true; b.style.opacity = 1;
    const a = q.alternativ && q.alternativ[i];
    if (!a) return;
    if (q.läge === 'ordning') return;
    const vald = q.läge === 'ett' ? svar === i : svar.includes(i);
    if (a.ratt && vald) b.classList.add('ratt');
    else if (a.ratt) b.classList.add(q.läge === 'flera' ? 'missad' : 'ratt');
    else if (vald) b.classList.add('fel');
    b.classList.remove('vald');
  });

  const rubrik = { ratt: 'Rätt!', delvis: 'Nästan!', fel: svar === '' ? 'Så här är det' : 'Fel' }[res];
  let detalj = '';
  if (q.läge === 'flera' && res !== 'ratt') detalj = `Rätt svar: ${esc(lista(q.alternativ.filter(a => a.ratt).map(a => a.t)))}.`;
  if (q.läge === 'flera' && res === 'delvis') detalj = 'Du fick med en del men inte allt. ' + detalj;
  if (q.läge === 'tal' && res !== 'ratt') detalj = `Rätt svar: ${q.ratta[0]}.`;
  if (q.läge === 'skriv') {
    const namn = q.giltiga.map(p => p.namn);
    detalj = res === 'ratt'
      ? (q.giltiga.length > 1 ? `Alla möjliga svar: ${esc(lista(namn))}.` : '')
      : `${q.giltiga.length > 1 ? 'Möjliga svar' : 'Rätt svar'}: ${esc(lista(namn))}.`;
  }
  if (q.läge === 'ordning' && res !== 'ratt') detalj = 'Rätt ordning visas nedan.';
  const faktaHtml = [
    q.person ? `<div class="fakta">${faktaRad(q.person)}</div>` : '',
    q.traff && q.traff !== q.person ? `<div class="fakta">${faktaRad(q.traff)}</div>` : '',
    ...(q.extraFakta || []).map(t => `<div class="fakta">${esc(t)}</div>`),
    q.förklaring ? `<div class="fakta">${esc(q.förklaring)}</div>` : '',
    q.källa ? `<div class="kalla">Källa: svenska Wikipedia, ”${esc(q.källa)}”</div>` : '',
  ].join('');
  const yta = $('#svarsyta');
  const fb = document.createElement('div');
  fb.innerHTML = `<div class="aterkoppling ${res}"><div class="rubrik">${rubrik}</div>${detalj ? `<div>${detalj}</div>` : ''}${faktaHtml}</div>
    <button class="primar" id="nasta" style="margin-top:12px">Nästa</button>`;
  if (q.läge === 'tal' || q.läge === 'skriv') yta.innerHTML = '';
  const svara = $('#svara'); if (svara) svara.remove();
  yta.appendChild(fb);
  $('#nasta').onclick = () => { runda.i++; visaFraga(); };
  $('#nasta').focus({ preventScroll: true });
  fb.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function visaSlut() {
  const nyNiva = upplasta().length > runda.upplastaFore;
  const tot = runda.ratt + runda.fel + runda.delvis;
  app().innerHTML = `
    <h1>${nyNiva ? '🎉 Ny nivå upplåst!' : 'Rundan klar'}</h1>
    <div class="siffror" style="margin-top:12px">
      <div><b>${runda.ratt}</b><span>rätt</span></div>
      <div><b>${runda.delvis}</b><span>nästan</span></div>
      <div><b>${runda.fel}</b><span>fel</span></div>
    </div>
    <p class="svag" style="margin-top:10px">${Math.round(100 * (runda.ratt + runda.delvis / 2) / Math.max(1, tot))} % rätt. Det du missade kommer tillbaka snart.</p>
    ${runda.missade.length ? `<h2>Att repetera</h2><ul class="lista">${unika(runda.missade.filter(q => q.person).map(q => q.person)).map(p => `<li>${faktaRad(p)}</li>`).join('')}</ul>` : ''}
    <div class="botten">
      <button class="primar" id="igen">Spela en runda till</button>
      <button id="hem" style="text-align:center">Till startsidan</button>
    </div>`;
  $('#igen').onclick = startaRunda;
  $('#hem').onclick = visaHem;
}

function visaStatistik() {
  const allaKort = Object.entries(T.kort);
  const ratt = allaKort.reduce((s, [, k]) => s + k.ratt, 0);
  const fel = allaKort.reduce((s, [, k]) => s + k.fel, 0);
  const larda = P.filter(arLard);
  const missar = allaKort.filter(([id, k]) => k.fel > 0 && !id.startsWith('fakta|'))
    .map(([id, k]) => [k.fel / (k.ratt + k.fel), k, id]).sort((a, b) => b[0] - a[0] || b[1].fel - a[1].fel).slice(0, 12);
  const typNamn = { år: 'Årtal', land: 'Land', språk: 'Språk', verk: 'Verk', fakta: 'Faktafrågor', 'land+bokstav': 'Land + bokstav',
    flerspråkiga: 'Flerspråkiga', språkgrupp: 'Språkgrupp', räkna: 'Räkna', ensam: 'Ensam i sitt land', tidslinje: 'Vem först', ordning: 'Tidsordning',
    initialer: 'Initialer', kvinnor: 'Kvinnliga pristagare', delat: 'Delat pris', bokstav: 'Bokstav', 'två gånger': 'Två gånger' };
  const dagar = Object.keys(T.dagar).sort().slice(-7);
  app().innerHTML = `
    <div class="topprad"><button class="stang liten" id="tillbaka">←</button><h1 style="margin:0">Statistik</h1></div>
    <div class="siffror" style="margin-top:12px">
      <div><b>${larda.length}</b><span>av ${P.length} lärda</span></div>
      <div><b>${ratt}</b><span>rätt svar</span></div>
      <div><b>${ratt + fel ? Math.round(100 * ratt / (ratt + fel)) : 0} %</b><span>träffsäkerhet</span></div>
    </div>
    <h2>Framsteg per nivå</h2>
    <div class="stapel">${nivaLista().map(n => {
      const s = nivaStatus(n);
      return `<div><div class="rad" style="justify-content:space-between"><span>Nivå ${n}</span><span class="svag" style="text-align:right">${s.larda} lärda · ${s.paborjade} påbörjade · ${s.totalt} totalt</span></div>
      <div class="mätare"><div style="width:${Math.round(100 * s.andel)}%"></div></div></div>`;
    }).join('')}</div>
    <h2>Per frågetyp</h2>
    <ul class="lista">${Object.entries(T.typStat).sort((a, b) => (b[1].ratt + b[1].fel) - (a[1].ratt + a[1].fel)).map(([t, s]) => {
      const tot = s.ratt + s.fel + (s.delvis || 0);
      const p = Math.round(100 * (s.ratt + (s.delvis || 0) / 2) / Math.max(1, tot));
      return `<li><div class="rad" style="justify-content:space-between"><span>${esc(typNamn[t] || t)}</span><span class="svag" style="text-align:right">${p} % av ${tot}</span></div>
        <div class="mätare ratt"><div style="width:${p}%"></div></div></li>`;
    }).join('') || '<li class="svag">Spela en runda först.</li>'}</ul>
    ${dagar.length ? `<h2>Senaste dagarna</h2><ul class="lista">${dagar.map(d => `<li>${d}: ${T.dagar[d].ratt} rätt, ${T.dagar[d].delvis || 0} nästan, ${T.dagar[d].fel} fel</li>`).join('')}</ul>` : ''}
    <h2>Det här missar du oftast</h2>
    <ul class="lista">${missar.map(([andel, k, id]) => {
      const [pid, typ] = id.split('|'); const p = PID[pid]; if (!p) return '';
      return `<li><span class="etikett varning">${esc(typNamn[typ] || typ)}</span> ${Math.round(andel * 100)} % fel (${k.fel} gånger)<div class="fakta">${faktaRad(p)}</div></li>`;
    }).join('') || '<li class="svag">Inga missar ännu.</li>'}</ul>
    <h2>Det här kan du (${larda.length})</h2>
    <ul class="lista">${larda.map(p => `<li>${faktaRad(p)}</li>`).join('') || '<li class="svag">En person räknas som lärd när alla dess fakta nått fack 3.</li>'}</ul>
    <div class="botten"><button id="hem" style="text-align:center">Till startsidan</button></div>`;
  $('#tillbaka').onclick = visaHem;
  $('#hem').onclick = visaHem;
}

function visaLasPa(n) {
  app().innerHTML = `
    <div class="topprad"><button class="stang liten" id="tillbaka">←</button><h1 style="margin:0">Läs på</h1></div>
    <div class="flikar">${nivaLista().map(i => `<button data-n="${i}" class="${i === n ? 'aktiv' : ''}">${i}</button>`).join('')}</div>
    <p class="svag">Nivå ${n}, sorterad efter årtal. Fack = hur väl du kan personen (0–5).</p>
    <ul class="lista">${NIVAER[n - 1].slice().sort((a, b) => a.år - b.år).map(p =>
      `<li>${faktaRad(p)}<div><span class="etikett ${arLard(p) ? 'ok' : ''}">fack ${personFack(p)}</span></div></li>`).join('')}</ul>`;
  $('#tillbaka').onclick = visaHem;
  app().querySelectorAll('.flikar button').forEach(b => b.onclick = () => visaLasPa(+b.dataset.n));
}

function visaKontroll(flik) {
  const osakra = P.filter(p => p.osäkert && p.osäkert.length);
  const kvar = osakra.filter(p => !T.godkanda[p.id]).length;
  const fakta = DATA.faktafrågor;
  const kallor = unika(fakta.map(f => f.källa));
  let innehall = '';
  if (flik === 'uppgifter') {
    innehall = `<p class="svag">${kvar} av ${osakra.length} osäkra poster kvar att godkänna. Rätta direkt i fälten – flera värden skiljs med komma.</p>
    <ul class="lista">${osakra.sort((a, b) => !!T.godkanda[a.id] - !!T.godkanda[b.id] || a.år - b.år).map(p => `
      <li data-id="${p.id}">
        <div class="namn">${esc(p.namn)} (${p.år}) ${T.godkanda[p.id] ? '<span class="etikett ok">godkänd</span>' : ''} ${T.andringar[p.id] ? '<span class="etikett varning">ändrad</span>' : ''}</div>
        ${p.osäkert.map(o => `<div class="svag">⚠️ ${esc(o)}</div>`).join('')}
        ${S.fakta.includes('land') ? `<label class="falt">Land<input type="text" data-f="land" value="${esc(p.land.join(', '))}"></label>` : ''}
        ${S.fakta.includes('språk') ? `<label class="falt">Språk<input type="text" data-f="språk" value="${esc(p.språk.join(', '))}"></label>` : ''}
        ${S.fakta.includes('land') ? '' : `<label class="falt">Kön<input type="text" data-f="kön" value="${esc(p.kön || '')}"></label>`}
        <label class="falt">${S.verkOrd === 'bok' ? 'Bok' : 'Känt verk'}<input type="text" data-f="verk" value="${esc(p.verk || '')}"></label>
        <div class="svag">Källa: ”${esc(p.artikel)}”${p.verk_källa ? ` · verk: ${esc(p.verk_källa)}` : ''}</div>
        <div class="rad" style="margin-top:8px"><button class="liten primar" data-godkann>${T.godkanda[p.id] ? 'Godkänd ✓' : 'Godkänn'}</button></div>
      </li>`).join('')}</ul>`;
  } else if (flik === 'fakta') {
    innehall = !fakta.length ? '<p class="svag">Den här avdelningen har inga faktafrågor.</p>' : `<p class="svag">${fakta.length} faktafrågor från ${kallor.length} artiklar. ”Ta bort” stänger av en fråga i spelet.</p>
    ${kallor.map(k => `<details><summary>${esc(k)} (${fakta.filter(f => f.källa === k).length})</summary><ul class="lista">${fakta.filter(f => f.källa === k).map(f => `
      <li data-fid="${f.id}">
        <div>${esc(f.fråga)}</div>
        <div class="fakta"><b>Svar:</b> ${esc(f.svar)} <span class="svag">· fel: ${esc(f.fel.join(' / '))}</span></div>
        ${f.förklaring ? `<div class="svag">${esc(f.förklaring)}</div>` : ''}
        ${f.citat ? `<div class="kalla">Ur artikeln: ”${esc(f.citat)}”</div>` : ''}
        <div class="rad" style="margin-top:6px">
          <button class="liten" data-fok>${T.godkandaFakta[f.id] ? 'OK ✓' : 'OK'}</button>
          <button class="liten" data-fbort>${T.borttagnaFakta[f.id] ? 'Borttagen – ångra' : 'Ta bort'}</button>
        </div>
      </li>`).join('')}</ul></details>`).join('')}`;
  } else {
    innehall = `<p class="svag">Alla ${P.length} pristagare med artikellängd (byte) som avgör nivån.</p>
    <ul class="lista">${P.slice().sort((a, b) => a.år - b.år).map(p => `<li>${faktaRad(p)}<div class="svag">Nivå ${p.nivå} · ${p.artikellängd.toLocaleString('sv')} byte · ”${esc(p.artikel)}”</div></li>`).join('')}</ul>`;
  }
  app().innerHTML = `
    <div class="topprad"><button class="stang liten" id="tillbaka">←</button><h1 style="margin:0">Kontrollista</h1></div>
    <div class="flikar">
      <button data-f="uppgifter" class="${flik === 'uppgifter' ? 'aktiv' : ''}">Osäkra (${kvar})</button>
      <button data-f="fakta" class="${flik === 'fakta' ? 'aktiv' : ''}">Faktafrågor</button>
      <button data-f="alla" class="${flik === 'alla' ? 'aktiv' : ''}">Alla</button>
    </div>
    ${innehall}
    <div class="botten"><button id="hem" style="text-align:center">Till startsidan</button></div>`;
  $('#tillbaka').onclick = visaHem;
  $('#hem').onclick = visaHem;
  app().querySelectorAll('.flikar button').forEach(b => b.onclick = () => visaKontroll(b.dataset.f));
  app().querySelectorAll('li[data-id]').forEach(li => {
    const id = li.dataset.id;
    li.querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const orig = DATA.pristagare.find(p => p.id === id);
      const f = inp.dataset.f;
      const varde = (f === 'verk' || f === 'kön') ? inp.value.trim() : inp.value.split(',').map(s => s.trim()).filter(Boolean);
      T.andringar[id] = Object.assign({}, T.andringar[id], { [f]: varde });
      if (JSON.stringify(orig[f]) === JSON.stringify(varde)) delete T.andringar[id][f];
      if (!Object.keys(T.andringar[id]).length) delete T.andringar[id];
      spara(); byggData();
    });
    li.querySelector('[data-godkann]').onclick = () => {
      T.godkanda[id] = !T.godkanda[id]; if (!T.godkanda[id]) delete T.godkanda[id];
      spara(); visaKontroll('uppgifter');
    };
  });
  app().querySelectorAll('li[data-fid]').forEach(li => {
    const id = li.dataset.fid;
    li.querySelector('[data-fok]').onclick = e => { T.godkandaFakta[id] = !T.godkandaFakta[id]; spara(); e.target.textContent = T.godkandaFakta[id] ? 'OK ✓' : 'OK'; };
    li.querySelector('[data-fbort]').onclick = e => {
      if (T.borttagnaFakta[id]) delete T.borttagnaFakta[id]; else T.borttagnaFakta[id] = true;
      spara(); e.target.textContent = T.borttagnaFakta[id] ? 'Borttagen – ångra' : 'Ta bort';
    };
  });
}

function visaInstallningar() {
  app().innerHTML = `
    <div class="topprad"><button class="stang liten" id="tillbaka">←</button><h1 style="margin:0">Inställningar</h1></div>
    <h2>Säkerhetskopia</h2>
    <p class="svag">Allt sparas bara i den här telefonen. Kopiera texten nedan och spara den (t.ex. i Anteckningar) om du vill kunna flytta dina framsteg.</p>
    <textarea id="kopia" readonly>${esc(JSON.stringify(T))}</textarea>
    <div class="rad" style="margin-top:8px"><button class="liten" id="kopiera">Kopiera</button></div>
    <h2>Mina rättelser</h2>
    <p class="svag">Dina ändringar i kontrollistan. Skicka gärna den här texten till Claude så byggs de in i datafilen.</p>
    <textarea readonly>${esc(JSON.stringify({ godkända: Object.keys(T.godkanda), ändringar: T.andringar, borttagnaFakta: Object.keys(T.borttagnaFakta) }, null, 1))}</textarea>
    <h2>Återställ från kopia</h2>
    <textarea id="aterstall" placeholder="Klistra in en säkerhetskopia här"></textarea>
    <div class="rad" style="margin-top:8px"><button class="liten" id="aterstallKnapp">Återställ</button></div>
    <h2>Börja om</h2>
    <button class="liten" id="nollstall" style="width:100%">Radera alla framsteg</button>
    <p class="svag" style="margin-top:16px">Data: svenska Wikipedia, hämtad ${esc(DATA.hämtad)}. Version ${esc(DATA.version)}.</p>`;
  $('#tillbaka').onclick = visaHem;
  $('#kopiera').onclick = async () => {
    const t = $('#kopia'); t.select();
    try { await navigator.clipboard.writeText(t.value); $('#kopiera').textContent = 'Kopierat ✓'; }
    catch (e) { document.execCommand('copy'); $('#kopiera').textContent = 'Kopierat ✓'; }
  };
  $('#aterstallKnapp').onclick = () => {
    try { T = Object.assign(nyttTillstand(), JSON.parse($('#aterstall').value)); spara(); byggData(); visaHem(); }
    catch (e) { alert('Det gick inte att läsa kopian.'); }
  };
  $('#nollstall').onclick = () => {
    if (confirm('Radera alla framsteg? Det går inte att ångra.')) {
      const behall = { godkanda: T.godkanda, andringar: T.andringar, borttagnaFakta: T.borttagnaFakta, godkandaFakta: T.godkandaFakta };
      T = Object.assign(nyttTillstand(), behall); spara(); visaHem();
    }
  };
}

// ---------- Start ----------
const DATACACHE = {};
async function laddaSamling(nyckel) {
  const ny = SAMLINGAR[nyckel] || SAMLINGAR.nobel;
  // Hämta datan först; byt avdelning först när allt är på plats (inget sparas i fel avdelning)
  if (!DATACACHE[ny.nyckel]) {
    const svar = await fetch(ny.fil);
    DATACACHE[ny.nyckel] = await svar.json();
  }
  S = ny;
  try { localStorage.setItem(VALD_SAMLING, S.nyckel); } catch (e) { /* ingen lagring */ }
  DATA = DATACACHE[S.nyckel];
  if (!DATA.förstaÅr) DATA.förstaÅr = Math.min(...DATA.pristagare.map(p => p.år));
  ladda();
  byggData();
}
async function bytSamling(nyckel) {
  if (nyckel === S.nyckel) return;
  spara();
  app().innerHTML = '<p class="laddar">Laddar…</p>';
  try { await laddaSamling(nyckel); } catch (e) { app().innerHTML = '<p class="laddar">Kunde inte läsa datafilen.</p>'; return; }
  visaHem();
}
async function start() {
  let nyckel = 'nobel';
  try { nyckel = localStorage.getItem(VALD_SAMLING) || 'nobel'; } catch (e) { /* standard */ }
  try { await laddaSamling(nyckel); } catch (e) {
    app().innerHTML = '<p class="laddar">Kunde inte läsa datafilen.</p>';
    return;
  }
  visaHem();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
