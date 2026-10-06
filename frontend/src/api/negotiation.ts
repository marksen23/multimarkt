import { api } from './client';

export type NegotiationPlatform = 'KLEINANZEIGEN' | 'VINTED' | 'EBAY';

export type OfferPosition =
  | 'NO_OFFER'
  | 'BELOW_MIN'
  | 'AT_MIN'
  | 'BETWEEN'
  | 'AT_OR_ABOVE_TARGET';

export type NegotiationReplyId = 'accept' | 'counter' | 'decline';

export interface NegotiationReply {
  id: NegotiationReplyId;
  label: string;
  text: string;
  price: number | null;
  recommended: boolean;
}

export interface NegotiationSuggestion {
  itemId: string;
  title: string | null;
  targetPrice: number;
  minPrice: number;
  platform: NegotiationPlatform;
  offer: number | null;
  position: OfferPosition;
  assessment: string;
  replies: NegotiationReply[];
}

export const negotiationApi = {
  suggest: (itemId: string, body: { message: string; platform: NegotiationPlatform }) =>
    api.post<NegotiationSuggestion>(`/items/${itemId}/negotiation`, body),
};
