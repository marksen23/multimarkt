import { classifySourceCondition } from './condition';

describe('classifySourceCondition', () => {
  it.each([
    ['Wie neu', 'wie_neu'],
    ['Wie neu, mit Originalrechnung', 'wie_neu'],
    ['Neuwertig, OVP', 'wie_neu'],
    ['Sehr guter Zustand', 'gut'],
    ['Gut', 'gut'],
    ['Guter Zustand', 'gut'],
    ['Gebraucht — kleine Kratzer an der Sohle', 'gebraucht'],
    ['Gebrauchsspuren', 'gebraucht'],
    ['Defekt — Sohle löst sich', 'defekt'],
    ['Für Bastler', 'defekt'],
  ])('maps %j to %s', (condition, key) => {
    expect(classifySourceCondition(condition)).toEqual({
      conditionKey: key,
      conditionUncertain: false,
    });
  });

  it.each([null, undefined, '', '   ', 'siehe Beschreibung', 'Zustand unbekannt'])(
    'marks %j as uncertain',
    (condition) => {
      expect(classifySourceCondition(condition)).toEqual({
        conditionKey: null,
        conditionUncertain: true,
      });
    },
  );

  it('prefers a stated defect over a milder phrase in the same text', () => {
    expect(classifySourceCondition('Defekt, vorher wie neu')).toEqual({
      conditionKey: 'defekt',
      conditionUncertain: false,
    });
  });
});
