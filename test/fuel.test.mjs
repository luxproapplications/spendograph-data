import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, decimal, parseItaly, parseSpain, prettyBrand, toPack } from '../scripts/lib/fuel.mjs';

test('decimal parses comma prices and rejects empties', () => {
  assert.equal(decimal('1,399'), 1.399);
  assert.equal(decimal(''), null);
  assert.equal(decimal('0'), null);
  assert.equal(decimal(undefined), null);
});

test('prettyBrand fixes casing, keeps mixed case, drops station numbers', () => {
  assert.equal(prettyBrand('REPSOL'), 'Repsol');
  assert.equal(prettyBrand('BP'), 'BP');
  assert.equal(prettyBrand('Agip Eni'), 'Agip Eni');
  assert.equal(prettyBrand('Nº 10.935'), null);
  assert.equal(prettyBrand(''), null);
});

const station = (brand, e5, diesel) => ({ 'Rótulo': brand, 'Precio Gasolina 95 E5': e5, 'Precio Gasoleo A': diesel, 'Precio Gases licuados del petróleo': '' });

test('Spain: median per brand, minimum stations, implausible prices dropped', () => {
  const json = {
    Fecha: '21/11/2026 22:50:24',
    ListaEESSPrecio: [
      station('REPSOL', '1,500', '1,400'),
      station('REPSOL', '1,600', '1,500'),
      station('REPSOL', '1,700', '1,600'),
      station('SOLO', '1,000', '1,000'),
      station('REPSOL', '9,999', ''),
    ],
  };
  const snap = parseSpain(json, '2000-01-01');
  assert.equal(snap.date, '2026-11-21');
  const prices = aggregate(snap);
  const repsolPetrol = prices.find((p) => p.store === 'Repsol' && p.fuel === 'PETROL_95');
  assert.equal(repsolPetrol.cents, 160);
  assert.ok(!prices.some((p) => p.store === 'Solo'), 'brand with <3 stations excluded');
  assert.equal(JSON.parse(toPack(snap)).version, 1);
});

test('Italy: joins stations by id, only self-service', () => {
  const stations = 'Estrazione del 2026-11-20\nidImpianto|Gestore|Bandiera\n' + [1, 2, 3, 4].map((i) => `${i}|x|Agip Eni`).join('\n');
  const rows = [1, 2, 3, 4].map((i) => `${i}|Benzina|1,8${i}|1|d`).concat(['1|Benzina|1,100|0|d']);
  const prices = 'Estrazione del 2026-11-20\nidImpianto|descCarburante|prezzo|isSelf|dtComu\n' + rows.join('\n');
  const snap = parseItaly(prices, stations, '2000-01-01');
  assert.equal(snap.date, '2026-11-20');
  assert.equal(snap.prices.length, 4);
  const out = aggregate(snap);
  assert.equal(out[0].store, 'Agip Eni');
  assert.equal(out[0].source, 'fuel_it');
});
