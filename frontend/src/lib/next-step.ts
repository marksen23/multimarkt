/** Ein Satz, der auf dem Artikel sagt, was als Nächstes dran ist. */
export function nextStepHint(status: string): string | null {
  switch (status) {
    case 'NEW':
      return 'Als Nächstes: Fotos aufnehmen. Die KI trägt nur ein, was sie sieht.';
    case 'ANALYZING':
      return 'Die KI liest die Fotos. Das dauert meist unter einer Minute.';
    case 'REVIEW_REQUIRED':
      return 'Als Nächstes: unsichere Angaben prüfen. Danach kommt der Preis.';
    case 'READY':
      return 'Zuerst Abholung oder Versand, danach Preis und Veröffentlichen.';
    case 'LISTED':
      return 'Nach dem Verkauf hier abschließen. Andere Portale stehen darunter.';
    case 'SALE_CONFLICT':
      return 'Zwei Angaben widersprechen sich. Kläre, wo der Artikel verkauft wurde.';
    default:
      return null;
  }
}
