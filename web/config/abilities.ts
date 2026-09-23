import ABILITY_ASSETS from './abilities.json';
import { assetLabel, type NamedAsset } from './items';

const ABILITIES = ABILITY_ASSETS as Record<string, NamedAsset | undefined>;

export function abilityAsset(abilityName: string): NamedAsset | undefined {
  return ABILITIES[abilityName];
}

export function abilityIconPath(icon: string): string {
  return `/abilities/${icon}`;
}

export function abilityLabel(abilityName: string, locale: string): string {
  return assetLabel(abilityAsset(abilityName), abilityName, locale);
}
