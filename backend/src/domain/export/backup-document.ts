/**
 * Sicherung (Feature-Plan 3.12). Eine Datei mit Artikel, Einkäufen,
 * Verkäufen und der Fotoliste. Die Bilddateien selbst liegen nicht darin.
 * Kein Steuer- oder Buchhaltungsexport.
 */

import { berlinIsoDate } from '../sales/recent-weeks';

export const BACKUP_NOTE =
  'Sicherung der Artikel, Einkäufe, Verkäufe und der Fotoliste. Die Fotos selbst sind nicht in der Datei. Kein Steuer- oder Buchhaltungsexport.';

export interface BackupArticleSource {
  id: string;
  title: string | null;
  status: string;
  condition: string | null;
  createdAt: Date;
  updatedAt: Date;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  logisticsBulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
  postalCode: string | null;
  logisticsCaptured: boolean;
  purchasePriceEur: number | null;
  purchasePortal: string | null;
  purchaseDate: string | null;
  purchaseCondition: string | null;
  purchaseUrl: string | null;
  saleProceedsEur: number | null;
  salePortal: string | null;
  saleFeeEur: number | null;
  saleShippingEur: number | null;
  salePaymentMethod: string | null;
  salePurchasePriceEur: number | null;
  saleNetProfitEur: number | null;
  soldAt: Date | null;
}

export interface BackupPhotoSource {
  id: string;
  itemId: string;
  title: string | null;
  url: string;
  storageKey: string;
  shot: string | null;
  createdAt: Date | string;
}

export interface BackupArticle {
  id: string;
  title: string | null;
  status: string;
  condition: string | null;
  createdAt: string;
  updatedAt: string;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  logisticsBulky: boolean;
  pickupOnly: boolean;
  shippingPossible: boolean;
  postalCode: string | null;
  logisticsCaptured: boolean;
}

export interface BackupPurchase {
  itemId: string;
  title: string | null;
  purchasePriceEur: number | null;
  purchasePortal: string | null;
  purchaseDate: string | null;
  purchaseCondition: string | null;
  purchaseUrl: string | null;
}

export interface BackupSale {
  itemId: string;
  title: string | null;
  soldAt: string | null;
  salePortal: string | null;
  saleProceedsEur: number | null;
  saleFeeEur: number | null;
  saleShippingEur: number | null;
  salePaymentMethod: string | null;
  salePurchasePriceEur: number | null;
  saleNetProfitEur: number | null;
}

export interface BackupPhoto {
  id: string;
  itemId: string;
  title: string | null;
  url: string;
  storageKey: string;
  shot: string | null;
  createdAt: string;
}

export interface BackupDocument {
  exportedAt: string;
  note: string;
  articles: BackupArticle[];
  purchases: BackupPurchase[];
  sales: BackupSale[];
  photos: BackupPhoto[];
}

export function backupFilename(now: Date): string {
  return `sicherung-${berlinIsoDate(now)}.json`;
}

export function buildBackupDocument(
  items: BackupArticleSource[],
  photos: BackupPhotoSource[],
  now: Date,
): BackupDocument {
  return {
    exportedAt: now.toISOString(),
    note: BACKUP_NOTE,
    articles: items.map(toArticle),
    purchases: items.filter(hasPurchase).map(toPurchase),
    sales: items.filter((item) => item.status === 'SOLD').map(toSale),
    photos: photos.map(toPhoto),
  };
}

function hasPurchase(item: BackupArticleSource): boolean {
  return (
    item.purchasePriceEur != null ||
    item.purchasePortal != null ||
    item.purchaseDate != null ||
    item.purchaseCondition != null ||
    item.purchaseUrl != null
  );
}

function toArticle(item: BackupArticleSource): BackupArticle {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    condition: item.condition,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    weightGrams: item.weightGrams,
    lengthCm: item.lengthCm,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    logisticsBulky: item.logisticsBulky,
    pickupOnly: item.pickupOnly,
    shippingPossible: item.shippingPossible,
    postalCode: item.postalCode,
    logisticsCaptured: item.logisticsCaptured,
  };
}

function toPurchase(item: BackupArticleSource): BackupPurchase {
  return {
    itemId: item.id,
    title: item.title,
    purchasePriceEur: item.purchasePriceEur,
    purchasePortal: item.purchasePortal,
    purchaseDate: item.purchaseDate,
    purchaseCondition: item.purchaseCondition,
    purchaseUrl: item.purchaseUrl,
  };
}

function toSale(item: BackupArticleSource): BackupSale {
  return {
    itemId: item.id,
    title: item.title,
    soldAt: item.soldAt ? item.soldAt.toISOString() : null,
    salePortal: item.salePortal,
    saleProceedsEur: item.saleProceedsEur,
    saleFeeEur: item.saleFeeEur,
    saleShippingEur: item.saleShippingEur,
    salePaymentMethod: item.salePaymentMethod,
    salePurchasePriceEur: item.salePurchasePriceEur,
    saleNetProfitEur: item.saleNetProfitEur,
  };
}

function toPhoto(photo: BackupPhotoSource): BackupPhoto {
  const createdAt =
    photo.createdAt instanceof Date
      ? photo.createdAt
      : new Date(photo.createdAt);
  return {
    id: photo.id,
    itemId: photo.itemId,
    title: photo.title,
    url: photo.url,
    storageKey: photo.storageKey,
    shot: photo.shot,
    createdAt: createdAt.toISOString(),
  };
}
