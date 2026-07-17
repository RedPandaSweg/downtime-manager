import { getQuantity, itemIdentifier, quantityUpdate, round, sourceUuid } from "./utils.js";

export class ResourceService {
  static findMatches(actor, ingredient) {
    const wantedUuid = String(ingredient.uuid ?? "").toLowerCase();
    const wantedName = String(ingredient.name ?? "").trim().toLowerCase();
    const wantedIdentifier = String(ingredient.identifier ?? "").trim().toLowerCase();
    return actor.items.filter(item => {
      const source = String(sourceUuid(item)).toLowerCase();
      return Boolean(
        (wantedUuid && source === wantedUuid) ||
        (wantedIdentifier && itemIdentifier(item) === wantedIdentifier) ||
        (wantedName && String(item.name ?? "").trim().toLowerCase() === wantedName)
      );
    });
  }

  static available(actor, ingredient) {
    return this.findMatches(actor, ingredient).reduce((sum, item) => sum + getQuantity(item), 0);
  }

  static has(actor, ingredients, multiplier = 1) {
    return ingredients.every(ingredient => this.available(actor, ingredient) + 1e-9 >= Number(ingredient.quantity) * multiplier);
  }

  static async spend(actor, ingredients, multiplier = 1) {
    if (!this.has(actor, ingredients, multiplier)) return false;
    const updates = [];
    for (const ingredient of ingredients) {
      let remaining = round(Number(ingredient.quantity) * multiplier, 4);
      for (const item of this.findMatches(actor, ingredient)) {
        if (remaining <= 0) break;
        const current = getQuantity(item);
        const used = Math.min(current, remaining);
        remaining = round(remaining - used, 4);
        updates.push({_id: item.id, ...quantityUpdate(item, round(current - used, 4))});
      }
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    return true;
  }
}
