// Zustand nur aus der Zustandsangabe der Quelle. Der Titel bleibt außen
// vor: Schlüsselwörter dort verschlucken Anzeigen, deren Zustand nur im
// Text steht, und erfinden einen Zustand, den die Quelle nicht nennt.

export type AnkaufConditionKey = 'wie_neu' | 'gut' | 'gebraucht' | 'defekt';

const SOURCE_PHRASES: { key: AnkaufConditionKey; phrases: string[] }[] = [
  {
    key: 'defekt',
    phrases: ['defekt', 'bastler', 'kaputt', 'reparatur', 'löst sich'],
  },
  {
    key: 'wie_neu',
    phrases: [
      'wie neu',
      'neuwertig',
      'ovp',
      'unbenutzt',
      'ungetragen',
      'kaum getragen',
      'originalrechnung',
    ],
  },
  {
    key: 'gebraucht',
    phrases: ['gebraucht', 'gebrauchsspuren', 'kratzer', 'kleine mängel'],
  },
  {
    key: 'gut',
    phrases: ['sehr guter', 'sehr gut', 'guter zustand', 'gut erhalten', 'gut'],
  },
];

export interface ClassifiedCondition {
  conditionKey: AnkaufConditionKey | null;
  conditionUncertain: boolean;
}

export function classifySourceCondition(
  condition: string | null | undefined,
): ClassifiedCondition {
  const text = (condition ?? '').trim().toLowerCase();
  if (!text) return { conditionKey: null, conditionUncertain: true };

  for (const group of SOURCE_PHRASES) {
    if (group.phrases.some((phrase) => text.includes(phrase))) {
      return { conditionKey: group.key, conditionUncertain: false };
    }
  }

  return { conditionKey: null, conditionUncertain: true };
}
