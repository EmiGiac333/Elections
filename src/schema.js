import { UNITS } from './states.js';

export const UNIT_CODES = UNITS.map((u) => u.code);

const ticketAnalysis = {
  type: 'object',
  properties: {
    id: { type: 'string', enum: ['A', 'B'] },
    etichetta: { type: 'string', description: 'Nome breve del ticket, es. "Ticket A"' },
    partito_ipotetico: {
      type: 'string',
      description: 'Il partito o lo spazio politico più plausibile per questo ticket',
    },
    slogan: { type: 'string', description: 'Slogan di campagna in italiano, max 8 parole' },
    coalizione: {
      type: 'string',
      description: 'Descrizione della coalizione elettorale che riuscirebbe a costruire',
    },
    punti_di_forza: { type: 'array', items: { type: 'string' }, description: 'Da due a cinque punti' },
    punti_deboli: { type: 'array', items: { type: 'string' }, description: 'Da due a cinque punti' },
    stati_natali: {
      type: 'array',
      items: { type: 'string' },
      description: 'Sigle degli stati con un effetto "home state" per questo ticket',
    },
  },
  required: [
    'id',
    'etichetta',
    'partito_ipotetico',
    'slogan',
    'coalizione',
    'punti_di_forza',
    'punti_deboli',
    'stati_natali',
  ],
  additionalProperties: false,
};

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    nazionale: {
      type: 'object',
      properties: {
        voto_a: { type: 'number', description: 'Percentuale di voto popolare del ticket A' },
        voto_b: { type: 'number', description: 'Percentuale di voto popolare del ticket B' },
        voto_altri: { type: 'number', description: 'Percentuale per terzi candidati e schede altre' },
        affluenza: { type: 'number', description: 'Affluenza stimata in percentuale' },
        clima: {
          type: 'string',
          description: 'Due frasi sul clima politico nazionale di questa elezione ipotetica',
        },
      },
      required: ['voto_a', 'voto_b', 'voto_altri', 'affluenza', 'clima'],
      additionalProperties: false,
    },
    ticket: { type: 'array', items: ticketAnalysis },
    stati: {
      type: 'array',
      description: `Una riga per ciascuna delle ${UNIT_CODES.length} unità del Collegio Elettorale, nessuna esclusa`,
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', enum: UNIT_CODES },
          margine_a: {
            type: 'number',
            description:
              'Margine atteso in punti percentuali: positivo se vince il ticket A, negativo se vince il ticket B',
          },
          incertezza: {
            type: 'number',
            description: 'Deviazione standard del margine in punti (tipicamente fra 2 e 8)',
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
    stati_chiave: {
      type: 'array',
      items: { type: 'string', enum: UNIT_CODES },
      description: 'Le unità che deciderebbero davvero questa elezione',
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
      description: 'Titoli di giornale immaginari del giorno dopo il voto',
    },
    incognite: {
      type: 'array',
      description: 'Da due a cinque incognite che potrebbero cambiare il risultato',
      items: {
        type: 'object',
        properties: {
          titolo: { type: 'string' },
          descrizione: { type: 'string' },
          impatto: {
            type: 'number',
            description: 'Punti di margine nazionale che questa incognita sposterebbe (positivo = verso A)',
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
    'stati',
    'stati_chiave',
    'racconto',
    'titoli_di_giornale',
    'incognite',
  ],
  additionalProperties: false,
};
