/**
 * Validazione e normalizzazione dei dati del modulo.
 *
 * Sta fra i moduli condivisi perché serve a entrambi i percorsi: al server
 * quando il modello è remoto, e alla pagina quando il modello gira nel browser
 * e non c'è nessun server a controllare cosa arriva.
 */

import { hashSeed } from './simulation.js';

export function validateInput(payload) {
  const ticketA = validateTicket(payload?.ticketA, 'Ticket A');
  const ticketB = validateTicket(payload?.ticketB, 'Ticket B');

  const sameTicket =
    ticketA.president.toLowerCase() === ticketB.president.toLowerCase() &&
    ticketA.vice.toLowerCase() === ticketB.vice.toLowerCase();
  if (sameTicket) throw new Error('I due ticket devono essere diversi.');

  const year = Number(payload?.year);
  const iterations = Number(payload?.iterations);
  const scenario = typeof payload?.scenario === 'string' ? payload.scenario.slice(0, 1200) : '';

  return {
    ticketA,
    ticketB,
    scenario,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : 2028,
    iterations: Number.isFinite(iterations)
      ? Math.min(Math.max(Math.round(iterations), 1000), 100000)
      : 20000,
    seed:
      Number.isFinite(Number(payload?.seed)) && payload?.seed !== '' && payload?.seed !== null
        ? Math.abs(Math.round(Number(payload.seed))) >>> 0
        : hashSeed(
            `${ticketA.president}|${ticketA.vice}|${ticketB.president}|${ticketB.vice}|${scenario}`,
          ),
  };
}

function validateTicket(ticket, label) {
  const president = cleanName(ticket?.president);
  const vice = cleanName(ticket?.vice);
  if (!president) throw new Error(`${label}: manca il nome del candidato presidente.`);
  if (!vice) throw new Error(`${label}: manca il nome del candidato vicepresidente.`);
  if (president.toLowerCase() === vice.toLowerCase()) {
    throw new Error(`${label}: presidente e vicepresidente devono essere due persone diverse.`);
  }
  return {
    president,
    vice,
    party: typeof ticket?.party === 'string' ? ticket.party.trim().slice(0, 60) : '',
  };
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}
