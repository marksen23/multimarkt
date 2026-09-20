import { ValueTransformer } from 'typeorm';

// pg gibt NUMERIC standardmäßig als string zurück (Vermeidung von Float-
// Rundungsfehlern auf Treiberebene). Für Preisfelder brauchen die
// Disposition- und Pricing-Services (Schritt 4) echte JS-Numbers.
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
