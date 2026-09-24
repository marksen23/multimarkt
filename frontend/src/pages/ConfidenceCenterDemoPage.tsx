import { useState } from 'react';
import { ConfidenceCenter } from '../components/ConfidenceCenter';
import type { ItemDetail } from '../api/types';

const initialDetail: ItemDetail = {
  item: {
    id: 'demo-item-1',
    userId: 'demo-user',
    status: 'REVIEW_REQUIRED',
    title: 'Herrenjacke, schwarz',
    condition: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  listings: [],
  photos: [],
  attributes: [
    {
      id: 'a1',
      itemId: 'demo-item-1',
      attributeKey: 'category',
      attributeValue: 'Bekleidung > Herren > Jacken',
      truthState: 'USER_CONFIRMED',
      source: 'USER_INPUT',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'a2',
      itemId: 'demo-item-1',
      attributeKey: 'color',
      attributeValue: 'Schwarz',
      truthState: 'INFERRED',
      source: 'mock-gemini-vision-stub-v1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'a3',
      itemId: 'demo-item-1',
      attributeKey: 'material',
      attributeValue: 'Polyester',
      truthState: 'INFERRED',
      source: 'mock-gemini-vision-stub-v1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'a4',
      itemId: 'demo-item-1',
      attributeKey: 'brand',
      attributeValue: null,
      truthState: 'UNKNOWN',
      source: 'mock-gemini-vision-stub-v1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'a5',
      itemId: 'demo-item-1',
      attributeKey: 'size',
      attributeValue: null,
      truthState: 'UNKNOWN',
      source: 'mock-gemini-vision-stub-v1',
      createdAt: new Date().toISOString(),
    },
  ],
};

/**
 * Reine Design-/Demo-Seite (kein Backend-Call) — zeigt das Confidence
 * Center mit realistischen Beispieldaten, damit das Ampelsystem auch ohne
 * laufende DB/Backend begutachtet werden kann.
 */
export function ConfidenceCenterDemoPage() {
  const [detail, setDetail] = useState(initialDetail);
  const [saving, setSaving] = useState(false);

  return (
    <ConfidenceCenter
      detail={detail}
      saving={saving}
      onConfirmCondition={async (condition) => {
        setSaving(true);
        await new Promise((r) => setTimeout(r, 400));
        setDetail((prev) => ({ ...prev, item: { ...prev.item, condition } }));
        setSaving(false);
      }}
      onConfirmAttribute={async (key, value) => {
        setSaving(true);
        await new Promise((r) => setTimeout(r, 400));
        setDetail((prev) => ({
          ...prev,
          attributes: prev.attributes.map((a) =>
            a.attributeKey === key
              ? {
                  ...a,
                  attributeValue: value ?? a.attributeValue,
                  truthState: 'USER_CONFIRMED',
                  source: 'USER_INPUT',
                }
              : a,
          ),
        }));
        setSaving(false);
      }}
    />
  );
}
