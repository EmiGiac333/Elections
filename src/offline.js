/**
 * Modalità dimostrativa.
 *
 * Se non è configurata nessuna chiave API, il simulatore resta utilizzabile con
 * un modello euristico deterministico: dai nomi dei candidati vengono derivati
 * dei "tratti" pseudo-casuali ma stabili (stesso nome, stessi tratti), che
 * spostano il margine di ogni stato rispetto alla base storica.
 *
 * Non è un'analisi: è un segnaposto per provare l'interfaccia. Ogni risposta
 * generata qui è marcata `mode: "demo"` e l'interfaccia lo dichiara.
 */

import { UNITS } from './states.js';
import { hashSeed, createRng } from './simulation.js';

/** Estrae tratti stabili da un nome: stesso nome, stesso profilo politico. */
function traits(name) {
  const rng = createRng(hashSeed(name.toLowerCase().trim()));
  const draw = () => rng();
  return {
    ideologia: draw() * 2 - 1, // -1 = destra, +1 = sinistra
    carisma: draw(), // capacità di mobilitare elettori nuovi
    competenza: draw(), // percezione di affidabilità istituzionale
    polarizzazione: draw(), // quanto divide l'opinione pubblica
    urbanita: draw(), // appeal urbano contro appeal rurale
  };
}

function partyBias(label) {
  const l = (label ?? '').toLowerCase();
  if (/dem|progress|sinistr|liberal/.test(l)) return 0.85;
  if (/rep|gop|conserv|destr|maga/.test(l)) return -0.85;
  return null;
}

function ticketProfile(ticket) {
  const pres = traits(ticket.president);
  const vice = traits(ticket.vice);
  const forced = partyBias(ticket.party);
  return {
    ideologia: forced ?? pres.ideologia * 0.75 + vice.ideologia * 0.25,
    carisma: pres.carisma * 0.8 + vice.carisma * 0.2,
    competenza: pres.competenza * 0.7 + vice.competenza * 0.3,
    polarizzazione: Math.max(pres.polarizzazione, vice.polarizzazione * 0.8),
    urbanita: pres.urbanita * 0.75 + vice.urbanita * 0.25,
  };
}

export function offlineAnalysis({ ticketA, ticketB, scenario, year }) {
  const a = ticketProfile(ticketA);
  const b = ticketProfile(ticketB);

  // Quanto la vecchia frattura partitica continua a spiegare il voto.
  const alignment = (a.ideologia - b.ideologia) / 2;
  const nationalShift =
    (a.carisma - b.carisma) * 5 + (a.competenza - b.competenza) * 4 - (a.polarizzazione - b.polarizzazione) * 2;
  const urbanShift = (a.urbanita - b.urbanita) * 6;

  const stati = UNITS.map((u) => {
    // Uso il lean storico anche come indicatore approssimato di quanto lo stato
    // sia urbano: gli stati più democratici sono in media i più urbanizzati.
    const urbanIndex = Math.max(-1, Math.min(1, u.lean / 25));
    const margine =
      u.lean * alignment + nationalShift + urbanShift * urbanIndex + (u.elastic - 1) * nationalShift;

    const incertezza =
      2.5 +
      (a.polarizzazione + b.polarizzazione) * 1.8 +
      (Math.abs(margine) < 6 ? 1.5 : 0);

    return {
      code: u.code,
      margine_a: round(margine, 1),
      incertezza: round(incertezza, 1),
      reazione: reazione(u, margine),
    };
  });

  const pesato =
    stati.reduce((s, x) => {
      const unit = UNITS.find((u) => u.code === x.code);
      return s + x.margine_a * (unit.code.includes('-') ? 0 : unit.ev);
    }, 0) / UNITS.filter((u) => !u.code.includes('-')).reduce((s, u) => s + u.ev, 0);

  const votoAltri = round(2 + (a.polarizzazione + b.polarizzazione) * 1.5, 1);
  const votoA = round((100 - votoAltri) / 2 + pesato / 2, 1);
  const votoB = round(100 - votoAltri - votoA, 1);

  const chiave = [...stati]
    .sort((x, y) => Math.abs(x.margine_a) - Math.abs(y.margine_a))
    .slice(0, 6)
    .map((x) => x.code);

  return {
    nazionale: {
      voto_a: votoA,
      voto_b: votoB,
      voto_altri: votoAltri,
      affluenza: round(58 + (a.carisma + b.carisma) * 5, 1),
      clima:
        'Stima prodotta in modalità dimostrativa, senza interrogare nessun modello di intelligenza artificiale: i numeri derivano da una formula deterministica applicata ai nomi inseriti.',
    },
    ticket: [
      demoTicket('A', ticketA, a),
      demoTicket('B', ticketB, b),
    ],
    stati,
    stati_chiave: chiave,
    racconto: {
      campagna: `Simulazione euristica per il ${year}: la campagna viene modellata come uno scostamento dal risultato presidenziale 2024, con un peso della vecchia frattura partitica pari a ${(alignment * 100).toFixed(0)}%.`,
      dibattiti:
        'Non disponibile in modalità dimostrativa. Configura ANTHROPIC_API_KEY per ottenere l\'analisi generata dal modello.',
      media: 'Non disponibile in modalità dimostrativa.',
      sorpresa_ottobre: 'Non disponibile in modalità dimostrativa.',
      affluenza_e_demografia: `Lo spostamento nazionale applicato è di ${nationalShift >= 0 ? '+' : ''}${nationalShift.toFixed(1)} punti, quello urbano/rurale di ${urbanShift >= 0 ? '+' : ''}${urbanShift.toFixed(1)} punti.`,
      notte_elettorale: `Gli stati più stretti risultano: ${chiave.join(', ')}.`,
    },
    titoli_di_giornale: [
      'Modalità dimostrativa attiva: nessun titolo generato',
      'Imposta ANTHROPIC_API_KEY per l\'analisi completa',
      scenario?.trim()
        ? `Contesto inserito ma non utilizzato in questa modalità: "${scenario.trim().slice(0, 80)}"`
        : 'I numeri qui sotto servono solo a provare l\'interfaccia',
    ],
    incognite: [
      {
        titolo: 'Nessun modello interrogato',
        descrizione:
          'Questa esecuzione non ha usato Claude: i margini sono generati da un hash dei nomi dei candidati e non hanno alcun valore analitico.',
        impatto: 0,
      },
      {
        titolo: 'Base storica 2024',
        descrizione:
          'Tutti gli stati partono dal margine presidenziale 2024 e vengono spostati da una formula fissa uguale per tutti.',
        impatto: 0,
      },
    ],
  };
}

function demoTicket(id, ticket, profile) {
  return {
    id,
    etichetta: `${ticket.president} / ${ticket.vice}`,
    partito_ipotetico:
      ticket.party ||
      (profile.ideologia > 0.15 ? 'Area democratica' : profile.ideologia < -0.15 ? 'Area repubblicana' : 'Candidatura indipendente'),
    slogan: 'Slogan disponibile solo con il modello attivo',
    coalizione: `Profilo euristico — carisma ${(profile.carisma * 100).toFixed(0)}/100, competenza percepita ${(profile.competenza * 100).toFixed(0)}/100, polarizzazione ${(profile.polarizzazione * 100).toFixed(0)}/100.`,
    punti_di_forza: ['Analisi non disponibile in modalità dimostrativa', 'Configura una chiave API'],
    punti_deboli: ['Analisi non disponibile in modalità dimostrativa', 'Configura una chiave API'],
    stati_natali: [],
  };
}

function reazione(unit, margine) {
  const chi = margine > 0 ? 'ticket A' : 'ticket B';
  return `${unit.name}: vantaggio ${chi} di ${Math.abs(margine).toFixed(1)} punti (stima euristica, non analitica).`;
}

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
