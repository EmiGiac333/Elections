/**
 * Unità del Collegio Elettorale (ripartizione 2024-2030, totale 538 grandi elettori).
 *
 * Campi:
 *  - code:     sigla dell'unità (stato, DC, o distretto congressuale per ME/NE)
 *  - name:     nome esteso in italiano/inglese
 *  - ev:       grandi elettori assegnati a quell'unità
 *  - lean:     margine storico di riferimento in punti (positivo = Democratici,
 *              negativo = Repubblicani). Base: risultato presidenziale 2024,
 *              usato solo come ancoraggio del "terreno di gioco" dello stato:
 *              i ticket personalizzati vengono simulati come scostamenti da qui.
 *  - region:   macro-regione, usata per correlare gli errori di simulazione
 *  - elastic:  elasticità dello stato (quanto amplifica uno swing nazionale)
 *  - grid:     posizione [riga, colonna] nella mappa a tessere del frontend
 */

export const UNITS = [
  { code: 'AL', name: 'Alabama',        ev: 9,  lean: -30.4, region: 'South',     elastic: 0.9,  grid: [6, 7] },
  { code: 'AK', name: 'Alaska',         ev: 3,  lean: -13.1, region: 'West',      elastic: 1.0,  grid: [0, 0] },
  { code: 'AZ', name: 'Arizona',        ev: 11, lean: -5.5,  region: 'Southwest', elastic: 1.1,  grid: [6, 2] },
  { code: 'AR', name: 'Arkansas',       ev: 6,  lean: -30.6, region: 'South',     elastic: 0.9,  grid: [5, 5] },
  { code: 'CA', name: 'California',     ev: 54, lean: 20.2,  region: 'West',      elastic: 0.9,  grid: [4, 1] },
  { code: 'CO', name: 'Colorado',       ev: 10, lean: 11.0,  region: 'Southwest', elastic: 1.1,  grid: [5, 3] },
  { code: 'CT', name: 'Connecticut',    ev: 7,  lean: 14.5,  region: 'Northeast', elastic: 0.9,  grid: [2, 9] },
  { code: 'DE', name: 'Delaware',       ev: 3,  lean: 14.9,  region: 'Northeast', elastic: 0.9,  grid: [4, 10] },
  { code: 'DC', name: 'Distretto di Columbia', ev: 3, lean: 85.5, region: 'Northeast', elastic: 0.3, grid: [5, 9] },
  { code: 'FL', name: 'Florida',        ev: 30, lean: -13.1, region: 'South',     elastic: 1.0,  grid: [7, 9] },
  { code: 'GA', name: 'Georgia',        ev: 16, lean: -2.2,  region: 'South',     elastic: 1.0,  grid: [6, 8] },
  { code: 'HI', name: 'Hawaii',         ev: 4,  lean: 23.4,  region: 'West',      elastic: 0.8,  grid: [7, 0] },
  { code: 'ID', name: 'Idaho',          ev: 4,  lean: -36.6, region: 'West',      elastic: 0.9,  grid: [3, 2] },
  { code: 'IL', name: 'Illinois',       ev: 19, lean: 10.9,  region: 'Midwest',   elastic: 1.0,  grid: [3, 5] },
  { code: 'IN', name: 'Indiana',        ev: 11, lean: -18.9, region: 'Midwest',   elastic: 1.0,  grid: [3, 6] },
  { code: 'IA', name: 'Iowa',           ev: 6,  lean: -13.2, region: 'Midwest',   elastic: 1.2,  grid: [3, 4] },
  { code: 'KS', name: 'Kansas',         ev: 6,  lean: -16.2, region: 'Midwest',   elastic: 1.0,  grid: [5, 4] },
  { code: 'KY', name: 'Kentucky',       ev: 8,  lean: -30.5, region: 'South',     elastic: 0.9,  grid: [4, 6] },
  { code: 'LA', name: 'Louisiana',      ev: 8,  lean: -22.1, region: 'South',     elastic: 0.9,  grid: [6, 5] },
  { code: 'ME', name: 'Maine (voto statale)', ev: 2, lean: 7.0, region: 'Northeast', elastic: 1.2, grid: [0, 11] },
  { code: 'ME-01', name: 'Maine 1º distretto', ev: 1, lean: 15.0, region: 'Northeast', elastic: 1.1, grid: null },
  { code: 'ME-02', name: 'Maine 2º distretto', ev: 1, lean: -9.4, region: 'Northeast', elastic: 1.3, grid: null },
  { code: 'MD', name: 'Maryland',       ev: 10, lean: 26.9,  region: 'Northeast', elastic: 0.9,  grid: [4, 9] },
  { code: 'MA', name: 'Massachusetts',  ev: 11, lean: 25.4,  region: 'Northeast', elastic: 0.9,  grid: [1, 11] },
  { code: 'MI', name: 'Michigan',       ev: 15, lean: -1.4,  region: 'Midwest',   elastic: 1.1,  grid: [2, 7] },
  { code: 'MN', name: 'Minnesota',      ev: 10, lean: 4.3,   region: 'Midwest',   elastic: 1.1,  grid: [2, 4] },
  { code: 'MS', name: 'Mississippi',    ev: 6,  lean: -22.8, region: 'South',     elastic: 0.9,  grid: [6, 6] },
  { code: 'MO', name: 'Missouri',       ev: 10, lean: -18.4, region: 'Midwest',   elastic: 1.0,  grid: [4, 5] },
  { code: 'MT', name: 'Montana',        ev: 4,  lean: -20.0, region: 'West',      elastic: 1.0,  grid: [2, 2] },
  { code: 'NE', name: 'Nebraska (voto statale)', ev: 2, lean: -20.5, region: 'Midwest', elastic: 1.0, grid: [4, 4] },
  { code: 'NE-01', name: 'Nebraska 1º distretto', ev: 1, lean: -11.0, region: 'Midwest', elastic: 1.0, grid: null },
  { code: 'NE-02', name: 'Nebraska 2º distretto', ev: 1, lean: 4.6,  region: 'Midwest', elastic: 1.1, grid: null },
  { code: 'NE-03', name: 'Nebraska 3º distretto', ev: 1, lean: -39.0, region: 'Midwest', elastic: 0.9, grid: null },
  { code: 'NV', name: 'Nevada',         ev: 6,  lean: -3.1,  region: 'Southwest', elastic: 1.2,  grid: [4, 2] },
  { code: 'NH', name: 'New Hampshire',  ev: 4,  lean: 2.8,   region: 'Northeast', elastic: 1.2,  grid: [1, 10] },
  { code: 'NJ', name: 'New Jersey',     ev: 14, lean: 5.9,   region: 'Northeast', elastic: 1.0,  grid: [3, 9] },
  { code: 'NM', name: 'New Mexico',     ev: 5,  lean: 6.1,   region: 'Southwest', elastic: 1.0,  grid: [6, 3] },
  { code: 'NY', name: 'New York',       ev: 28, lean: 12.6,  region: 'Northeast', elastic: 1.0,  grid: [2, 8] },
  { code: 'NC', name: 'Carolina del Nord', ev: 16, lean: -3.2, region: 'South',   elastic: 1.0,  grid: [5, 7] },
  { code: 'ND', name: 'Dakota del Nord', ev: 3, lean: -36.4, region: 'Midwest',   elastic: 0.9,  grid: [2, 3] },
  { code: 'OH', name: 'Ohio',           ev: 17, lean: -11.2, region: 'Midwest',   elastic: 1.1,  grid: [3, 7] },
  { code: 'OK', name: 'Oklahoma',       ev: 7,  lean: -33.6, region: 'South',     elastic: 0.9,  grid: [6, 4] },
  { code: 'OR', name: 'Oregon',         ev: 8,  lean: 14.9,  region: 'West',      elastic: 1.0,  grid: [3, 1] },
  { code: 'PA', name: 'Pennsylvania',   ev: 19, lean: -1.7,  region: 'Northeast', elastic: 1.1,  grid: [3, 8] },
  { code: 'RI', name: 'Rhode Island',   ev: 4,  lean: 13.8,  region: 'Northeast', elastic: 0.9,  grid: [2, 10] },
  { code: 'SC', name: 'Carolina del Sud', ev: 9, lean: -18.0, region: 'South',    elastic: 0.9,  grid: [5, 8] },
  { code: 'SD', name: 'Dakota del Sud', ev: 3,  lean: -29.5, region: 'Midwest',   elastic: 0.9,  grid: [3, 3] },
  { code: 'TN', name: 'Tennessee',      ev: 11, lean: -29.5, region: 'South',     elastic: 0.9,  grid: [5, 6] },
  { code: 'TX', name: 'Texas',          ev: 40, lean: -13.7, region: 'South',     elastic: 1.0,  grid: [7, 4] },
  { code: 'UT', name: 'Utah',           ev: 6,  lean: -21.7, region: 'West',      elastic: 1.1,  grid: [5, 2] },
  { code: 'VT', name: 'Vermont',        ev: 3,  lean: 32.3,  region: 'Northeast', elastic: 0.9,  grid: [1, 9] },
  { code: 'VA', name: 'Virginia',       ev: 13, lean: 5.8,   region: 'South',     elastic: 1.0,  grid: [4, 8] },
  { code: 'WA', name: 'Washington',     ev: 12, lean: 18.8,  region: 'West',      elastic: 0.9,  grid: [2, 1] },
  { code: 'WV', name: 'Virginia Occidentale', ev: 4, lean: -42.0, region: 'South', elastic: 0.9, grid: [4, 7] },
  { code: 'WI', name: 'Wisconsin',      ev: 10, lean: -0.9,  region: 'Midwest',   elastic: 1.1,  grid: [2, 5] },
  { code: 'WY', name: 'Wyoming',        ev: 3,  lean: -45.8, region: 'West',      elastic: 0.9,  grid: [4, 3] },
];

export const TOTAL_EV = UNITS.reduce((sum, u) => sum + u.ev, 0); // 538
export const MAJORITY = Math.floor(TOTAL_EV / 2) + 1;            // 270

export const UNIT_BY_CODE = new Map(UNITS.map((u) => [u.code, u]));

/** Stati storicamente in bilico: usati per suggerimenti e ordinamenti di default. */
export const CORE_BATTLEGROUNDS = ['PA', 'MI', 'WI', 'GA', 'NC', 'AZ', 'NV', 'NE-02', 'ME-02'];

/**
 * Peso approssimato di ciascuna unità sul voto popolare nazionale.
 * Si usa il numero di grandi elettori come proxy della popolazione; i distretti
 * di ME/NE pesano 0 perché il loro elettorato è già contato nel voto statale,
 * che per questo torna al totale pieno dello stato (Maine 4, Nebraska 5).
 */
const POP_WEIGHT_OVERRIDE = { ME: 4, NE: 5 };

export const POPULAR_WEIGHT = Object.fromEntries(
  UNITS.map((u) => [u.code, u.code.includes('-') ? 0 : (POP_WEIGHT_OVERRIDE[u.code] ?? u.ev)]),
);
