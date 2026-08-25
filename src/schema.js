/**
 * Schemi JSON richiesti al modello.
 *
 * L'analisi è divisa in due richieste invece che in una sola:
 *
 *  1. il PROFILO — voto nazionale, identikit dei due ticket, racconto della
 *     campagna: una risposta breve, che qualunque modello regge;
 *  2. i COLLEGI — le stime per stato, chieste a blocchi di poche unità.
 *
 * Serve proprio ai modelli gratuiti: chiedere 56 stime e tutta l'analisi in
 * un colpo solo è il modo più rapido per farli troncare o sbandare.
 */

import { UNITS } from './states.js';

export const UNIT_CODES = UNITS.map((u) => u.code);

const ticketAnalysis = {
  type: 'object',
  properties: {
    id: { type: 'string', enum: ['A', 'B'] },
    partito_ipotetico: {
      type: 'string',
      description: 'Il partito o lo spazio politico più plausibile per questo ticket',
    },
    slogan: { type: 'string', description: 'Slogan di campagna in italiano, massimo 8 parole' },
    coalizione: {
      type: 'string',
      description: 'La coalizione elettorale che questo ticket riuscirebbe a costruire',
    },
    punti_di_forza: {
      type: 'array',
      items: { type: 'string' },
      description: 'Da due a quattro punti di forza',
    },
    punti_deboli: {
      type: 'array',
      items: { type: 'string' },
      description: 'Da due a quattro punti deboli',
    },
    stati_natali: {
      type: 'array',
      items: { type: 'string' },
      description: 'Sigle degli stati con un effetto "home state" per questo ticket',
    },
  },
  required: [
    'id',
    'partito_ipotetico',
    'slogan',
    'coalizione',
    'punti_di_forza',
    'punti_deboli',
    'stati_natali',
  ],
  additionalProperties: false,
};

export const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    nazionale: {
      type: 'object',
      properties: {
        voto_a: { type: 'number', description: 'Percentuale di voto popolare del ticket A' },
        voto_b: { type: 'number', description: 'Percentuale di voto popolare del ticket B' },
        voto_altri: { type: 'number', description: 'Percentuale per terzi candidati' },
        affluenza: { type: 'number', description: 'Affluenza stimata in percentuale' },
        clima: { type: 'string', description: 'Due frasi sul clima politico di questa elezione' },
      },
      required: ['voto_a', 'voto_b', 'voto_altri', 'affluenza', 'clima'],
      additionalProperties: false,
    },
    ticket: { type: 'array', items: ticketAnalysis, description: 'Esattamente due voci: A e B' },
    stati_chiave: {
      type: 'array',
      items: { type: 'string', enum: UNIT_CODES },
      description: 'Da tre a otto unità che deciderebbero questa elezione',
    },
    racconto: {
      type: 'object',
      properties: {
        campagna: { type: 'string', description: 'Come si svolgerebbe la campagna, 3-5 frasi' },
        dibattiti: { type: 'string', description: 'Cosa succederebbe nei dibattiti televisivi' },
        media: { type: 'string', description: 'Reazione di media tradizionali e social' },
        sorpresa_ottobre: { type: 'string', description: 'Una plausibile "October surprise"' },
        affluenza_e_demografia: {
          type: 'string',
          description: 'Come cambierebbero affluenza e composizione demografica del voto',
        },
        notte_elettorale: { type: 'string', description: 'Come si svolgerebbe la notte dello spoglio' },
      },
      required: [
        'campagna',
        'dibattiti',
        'media',
        'sorpresa_ottobre',
        'affluenza_e_demografia',
        'notte_elettorale',
      ],
      additionalProperties: false,
    },
    titoli_di_giornale: {
      type: 'array',
      items: { type: 'string' },
      description: 'Da tre a cinque titoli di giornale immaginari del giorno dopo il voto',
    },
    incognite: {
      type: 'array',
      description: 'Da due a quattro incognite che potrebbero cambiare il risultato',
      items: {
        type: 'object',
        properties: {
          titolo: { type: 'string' },
          descrizione: { type: 'string' },
          impatto: {
            type: 'number',
            description: 'Punti di margine nazionale spostati (positivo = verso il ticket A)',
          },
        },
        required: ['titolo', 'descrizione', 'impatto'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'nazionale',
    'ticket',
    'stati_chiave',
    'racconto',
    'titoli_di_giornale',
    'incognite',
  ],
  additionalProperties: false,
};

/**
 * Schema per un blocco di collegi. L'enum contiene solo le sigle del blocco:
 * un modello piccolo sbaglia molto meno se le alternative sono poche.
 *
 * @param {string[]} codes sigle richieste in questo blocco
 */
export function buildStatesSchema(codes) {
  return {
    type: 'object',
    properties: {
      stati: {
        type: 'array',
        description: `Una voce per ciascuna di queste ${codes.length} unità: ${codes.join(', ')}`,
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', enum: codes },
            margine_a: {
              type: 'number',
              description:
                'Margine in punti percentuali: positivo se davanti il ticket A, negativo se davanti il ticket B',
            },
            incertezza: {
              type: 'number',
              description: 'Quanto è incerta la stima, in punti (di solito fra 2 e 8)',
            },
            reazione: {
              type: 'string',
              description: 'Reazione dello stato in massimo 130 caratteri, in italiano',
            },
          },
          required: ['code', 'margine_a', 'incertezza', 'reazione'],
          additionalProperties: false,
        },
      },
    },
    required: ['stati'],
    additionalProperties: false,
  };
}
