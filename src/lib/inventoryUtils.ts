import { InventoryItem, FoodItem, SupplyItem, AssetItem } from '../types';

export const isFoodItem = (item: InventoryItem): item is FoodItem => item.itemType === 'food';
export const isSupplyItem = (item: InventoryItem): item is SupplyItem => item.itemType === 'supply';
export const isAssetItem = (item: InventoryItem): item is AssetItem => item.itemType === 'asset';

export function getFoodItems(items: InventoryItem[]): FoodItem[] {
  return items.filter(isFoodItem);
}

export function getPantryViewItems(items: InventoryItem[]): (FoodItem | SupplyItem)[] {
  return items.filter((item): item is FoodItem | SupplyItem => isFoodItem(item) || isSupplyItem(item));
}

export function getVaultAssets(items: InventoryItem[]): AssetItem[] {
  return items.filter(isAssetItem);
}
