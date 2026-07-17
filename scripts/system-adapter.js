import { CHECK_DEFINITIONS, COIN_IDENTIFIERS, COIN_VALUE_CP, FLAGS, MODULE_ID } from "./constants.js";

function numeric(value, fallback = 0) {
  const number = Number(value?.value ?? value);
  return Number.isFinite(number) ? number : fallback;
}

function pathNumber(object, paths, fallback = 0) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], object);
    const number = numeric(value, NaN);
    if (Number.isFinite(number)) return number;
  }
  return fallback;
}

function identifier(item) {
  return String(item?.system?.identifier?.value ?? item?.system?.identifier ?? item?.system?.slug ?? item?.name ?? "").trim().toLowerCase();
}

export class GenericSystemAdapter {
  id = "generic";
  capabilities = Object.freeze({ checks: false, actorSources: false, currency: false, itemPrices: false, downtimeItems: false });

  getCheckDefinitions() { return []; }
  async rollCheck() { throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.UnsupportedSystemCheck")); }
  getActorProgressSources() { return { level: 0, proficiency: 0, checkProficiency: 0 }; }
  getItemPrice() { return 0; }
  isItemProficient() { return true; }
  getQuantity(item) { return numeric(item?.system?.quantity?.value ?? item?.system?.quantity, 0); }
  quantityUpdate(item, quantity) {
    return foundry.utils.hasProperty(item, "system.quantity.value")
      ? { "system.quantity.value": quantity }
      : { "system.quantity": quantity };
  }
  getGold() { return 0; }
  getDefaultGoldItemUuid() { return ""; }
  isGoldItem() { return false; }
  canAddGold(_actor, amount) { return Number(amount) <= 0; }
  async spendGold(actor, amount) { return Number(amount) <= 0; }
  async addGold(actor, amount) { return Number(amount) <= 0; }
  registerHooks() {}
}

export class BlackFlagSystemAdapter extends GenericSystemAdapter {
  id = "black-flag";
  capabilities = Object.freeze({ checks: true, actorSources: true, currency: true, itemPrices: true, downtimeItems: true });

  getCheckDefinitions() {
    const tools = globalThis.CONFIG?.BlackFlag?.tools?.localizedOptions ?? [];
    return [...CHECK_DEFINITIONS, ...tools.map(option => ({ type: "tool", key: option.value, label: option.label, localized: true }))];
  }
  getDefaultGoldItemUuid() { return "Compendium.black-flag.currencies.Item.eWMYzM5UVZUDIqtg"; }
  isGoldItem(item) { return identifier(item) === "gp"; }

  async rollCheck(actor, check) {
    let rolls;
    if (check?.type === "skill") rolls = await actor.rollSkill({ skill: check.key });
    else if (check?.type === "ability") rolls = await actor.rollAbilityCheck({ ability: check.key });
    else if (check?.type === "tool") rolls = await actor.rollTool({ tool: check.key });
    else throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.UnsupportedCheck"));
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) return null;
    return { roll, total: Number(roll.total), natural: Number(roll.challengeDie?.total ?? roll.dice?.[0]?.total) };
  }

  getActorProgressSources(actor, check) {
    const level = pathNumber(actor, ["system.progression.level", "system.details.level", "system.level"]);
    const proficiency = pathNumber(actor, ["system.attributes.proficiency", "system.attributes.prof", "system.proficiency"]);
    const group = check?.type === "skill" ? "skills" : check?.type === "tool" ? "tools" : null;
    let degree = group ? pathNumber(actor, [`system.proficiencies.${group}.${check.key}.proficiency.multiplier`]) : 0;
    if (check?.type === "ability") degree = pathNumber(actor, [`system.abilities.${check.key}.check.proficiency.multiplier`]);
    return { level, proficiency, checkProficiency: proficiency * degree };
  }

  getItemPrice(item) {
    const price = item?.system?.price;
    const value = numeric(price?.value ?? price, 0);
    const denomination = String(price?.denomination ?? price?.currency ?? "gp").toLowerCase();
    return value * ({ pp: 10, gp: 1, sp: 0.1, cp: 0.01 }[denomination] ?? 1);
  }
  isItemProficient(item) {
    const value = item?.system?.proficient?.value ?? item?.system?.proficient ?? item?.system?.proficiency?.value ?? item?.system?.proficiency;
    return value === undefined || value === null || value === true || Number(value) > 0;
  }

  #coins(actor) {
    return actor.items.map(item => ({ item, id: identifier(item), quantity: this.getQuantity(item) }))
      .filter(entry => COIN_IDENTIFIERS.includes(entry.id));
  }
  getGold(actor) { return this.#coins(actor).reduce((sum, entry) => sum + entry.quantity * COIN_VALUE_CP[entry.id], 0) / 100; }
  canAddGold(actor, gold) {
    const amount = Number(gold);
    return Number.isFinite(amount) && amount >= 0 && this.#coins(actor).some(entry => entry.id === "gp");
  }
  async spendGold(actor, gold) {
    if (!Number.isFinite(Number(gold)) || Number(gold) < 0) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.InvalidGoldCost"));
    return this.#changeGold(actor, -Number(gold), "InvalidGoldCost");
  }
  async addGold(actor, gold) {
    if (!Number.isFinite(Number(gold)) || Number(gold) < 0) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.InvalidGoldReward"));
    const entry = this.#coins(actor).find(candidate => candidate.id === "gp");
    if (!entry) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.RewardCurrencyMissing"));
    await entry.item.update(this.quantityUpdate(entry.item, entry.quantity + Number(gold)));
    return true;
  }
  async #changeGold(actor, gold, errorKey) {
    if (!Number.isFinite(gold)) throw new Error(game.i18n.localize(`DOWNTIME_MANAGER.Errors.${errorKey}`));
    const entries = this.#coins(actor);
    let copper = Math.round(this.getGold(actor) * 100 + gold * 100);
    if (copper < 0) return false;
    const updates = [];
    for (const id of COIN_IDENTIFIERS) {
      const entry = entries.find(candidate => candidate.id === id);
      if (!entry) continue;
      const quantity = Math.floor(copper / COIN_VALUE_CP[id]);
      copper -= quantity * COIN_VALUE_CP[id];
      updates.push({ _id: entry.item.id, ...this.quantityUpdate(entry.item, quantity) });
    }
    if (copper !== 0) throw new Error(game.i18n.localize(`DOWNTIME_MANAGER.Errors.${gold < 0 ? "ExactChangeMissing" : "RewardCurrencyMissing"}`));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    return true;
  }

  registerHooks({ redeemDowntimeItem } = {}) {
    Hooks.on("blackFlag.postActivateActivity", async activity => {
      const item = activity?.item;
      const actor = item?.actor ?? item?.parent;
      if (!item || actor?.documentName !== "Actor") return;
      if (item.getFlag?.(MODULE_ID, FLAGS.DOWNTIME_ITEM)?.enabled) {
        try {
          await redeemDowntimeItem?.(item, { consume: false });
        } catch (error) {
          console.error(`${MODULE_ID} | Native downtime item redemption failed`, error);
          ui.notifications.error(error.message);
        }
        return;
      }
    });
  }
}

const adapterFactories = new Map([
  ["black-flag", () => new BlackFlagSystemAdapter()]
]);
let adapter;
let adapterSystemId;

export function registerSystemAdapter(systemId, factory) {
  if (!systemId || typeof factory !== "function") throw new TypeError("A system id and adapter factory are required.");
  adapterFactories.set(String(systemId), factory);
  if (adapterSystemId === String(systemId)) adapter = null;
}

export function getSystemAdapter() {
  const systemId = globalThis.game?.system?.id;
  if (!adapter || adapterSystemId !== systemId) {
    adapter = adapterFactories.get(systemId)?.() ?? new GenericSystemAdapter();
    adapterSystemId = systemId;
  }
  return adapter;
}
