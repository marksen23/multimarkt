import { NegotiationAssistant } from '../components/NegotiationAssistant';

export function NegotiationDemoPage() {
  return (
    <NegotiationAssistant
      itemTitle="Sony PlayStation 4 — 500GB"
      targetPrice={120}
      minAcceptablePrice={95}
      buyerName="Alex99"
      platform="Kleinanzeigen"
      incomingMessage="Hallo, ich biete 80€ und komme es heute Abend direkt abholen. Barzahlung. LG"
      offeredPrice={80}
      suggestedActions={[
        {
          id: 'counter',
          label: 'Gegenangebot: 100€',
          variant: 'primary',
          text: 'Hallo Alex, 80€ ist mir leider zu wenig. Für glatte 100€ kannst du sie heute Abend abholen. Wie sieht’s aus?',
        },
        {
          id: 'firm_min',
          label: 'Schmerzgrenze: 95€',
          variant: 'secondary',
          text: 'Hallo Alex, danke fürs Angebot. Mein absoluter Tiefstpreis sind 95€. Wenn das passt, können wir eine Uhrzeit für heute Abend ausmachen.',
        },
        {
          id: 'decline',
          label: 'Höflich ablehnen',
          variant: 'danger',
          text: 'Hallo Alex, danke für dein Angebot, aber das ist mir leider zu wenig. Viel Erfolg bei der weiteren Suche!',
        },
      ]}
    />
  );
}
