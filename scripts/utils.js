import {
  DEFAULT_PROJECT_CONFIG,
  DEFAULT_STATION_CONFIG,
  FLAGS,
  MODULE_ID
} from "./constants.js";
import { getSystemAdapter } from "./system-adapter.js";

export function itemIdentifier(item) {
  return String(item?.system?.identifier?.value ?? item?.system?.identifier ?? item?.system?.slug ?? item?.getFlag?.(MODULE_ID, "resourceIdentifier") ?? item?.name ?? "").trim().toLowerCase();
}
export function sourceUuid(item) {
  return item?._stats?.compendiumSource
    ?? item?._stats?.duplicateSource
    ?? item?.uuid
    ?? "";
}
export function getQuantity(item) { return getSystemAdapter().getQuantity(item); }
export function quantityUpdate(item, quantity) { return getSystemAdapter().quantityUpdate(item, quantity); }
export function toolMatches(item, requiredTool) {
  if (!requiredTool?.uuid && !requiredTool?.identifier && !requiredTool?.name) return false;
  return Boolean((requiredTool.uuid && String(sourceUuid(item)).toLowerCase() === String(requiredTool.uuid).toLowerCase()) || (requiredTool.identifier && itemIdentifier(item) === String(requiredTool.identifier).toLowerCase()) || (requiredTool.name && String(item.name ?? "").trim().toLowerCase() === String(requiredTool.name).trim().toLowerCase()));
}
export function hasRequiredTool(actor, requiredTool) { if (!requiredTool?.uuid && !requiredTool?.identifier && !requiredTool?.name) return true; return actor.items.some(item => toolMatches(item, requiredTool) && getSystemAdapter().isItemProficient(item)); }
export function isRecipeItem(item) { return Boolean(item?.getFlag?.(MODULE_ID, FLAGS.RECIPE)?.enabled); }

export function parseCategories(value) {
  const entries = Array.isArray(value) ? value : String(value ?? "").split(",");
  const categories = [];
  const keys = new Set();
  for (const entry of entries) {
    const category = String(entry ?? "").trim();
    const key = category.toLocaleLowerCase();
    if (!category || keys.has(key)) continue;
    keys.add(key);
    categories.push(category);
  }
  return categories;
}

export function categoriesMatch(stationCategories, projectCategories) {
  const available = new Set(parseCategories(stationCategories).map(category => category.toLocaleLowerCase()));
  return parseCategories(projectCategories)
    .some(category => available.has(category.toLocaleLowerCase()));
}
export function getItemPriceGp(item) {
  return round(getSystemAdapter().getItemPrice(item), 4);
}
export function getActiveCrafter() { return canvas?.tokens?.controlled?.find(t => t.actor)?.actor ?? game.user.character ?? null; }
export function round(value, places = 4) { const f = 10 ** places; return Math.round((Number(value) + Number.EPSILON) * f) / f; }
export function addHeaderControl(controls, control) { if (!Array.isArray(controls) || controls.some(e => e.action === control.action)) return; controls.unshift(control); }

export function getStationData(actor) {
  const stored = foundry.utils.deepClone(
    actor.getFlag(MODULE_ID, FLAGS.STATION) ?? {}
  );
  const data = foundry.utils.mergeObject(
    defaultStationData(),
    stored,
    { inplace: false, recursive: true }
  );
  data.categories = parseCategories(data.categories);

  // Read existing station data without persisting a migration.
  const existingChecks = stored.working?.allowedChecks?.length
    ? stored.working.allowedChecks
    : DEFAULT_STATION_CONFIG.allowedChecks;
  data.allowedChecks = normalizeChecks(
    Object.hasOwn(stored, "allowedChecks") ? stored.allowedChecks : existingChecks
  );
  data.recipes = Array.isArray(stored.recipes) ? stored.recipes : [];
  data.modifiers = Array.isArray(stored.modifiers) ? stored.modifiers : [];
  data.progressSources = foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_STATION_CONFIG.progressSources),
    stored.progressSources ?? {},
    { inplace: false, recursive: true }
  );
  const adapter = getSystemAdapter();
  if (!adapter.capabilities.checks) {
    data.allowedChecks = [];
    data.requiresRoll = false;
    data.progressSources.checkProficiency.enabled = false;
  }
  if (!adapter.capabilities.actorSources) {
    data.progressSources.level.enabled = false;
    data.progressSources.proficiency.enabled = false;
  }
  const storedRollTable = Array.isArray(stored.rollTable) && stored.rollTable.length
    ? stored.rollTable
    : foundry.utils.deepClone(DEFAULT_STATION_CONFIG.rollTable);
  const defaults = foundry.utils.deepClone(DEFAULT_STATION_CONFIG.rollTable);
  const natural1 = storedRollTable.find(row => row.natural1);
  const natural20 = storedRollTable.find(row => row.natural20);
  const defaultNatural1 = defaults.find(row => row.natural1);
  const defaultNatural20 = defaults.find(row => row.natural20);
  const normalRows = storedRollTable.filter(row => !row.natural1 && !row.natural20);
  data.rollTable = [
    { ...defaultNatural1, ...natural1, enabled: natural1?.enabled !== false, natural1: true, natural20: false },
    ...normalRows.map(row => ({ ...row, enabled: true, natural1: false, natural20: false })),
    { ...defaultNatural20, ...natural20, enabled: natural20?.enabled !== false, natural1: false, natural20: true }
  ];
  data.actorValue = foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_STATION_CONFIG.actorValue),
    stored.actorValue ?? {},
    { inplace: false, recursive: true }
  );
  return data;
}
export function isStation(actor) { return Boolean(actor?.getFlag?.(MODULE_ID, FLAGS.STATION)); }

export function defaultRecipeData() {
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(DEFAULT_PROJECT_CONFIG),
    {
    itemPrice: 0,
    resultUuid: "",
    resultQuantity: 1,
    ingredients: []
    },
    { inplace: false }
  );
}

export function recipeData(item, { sourceUuid: explicitUuid = "" } = {}) {
  if (isRecipeItem(item)) {
    const stored = foundry.utils.deepClone(
      item.getFlag(MODULE_ID, FLAGS.RECIPE) ?? {}
    );
    const data = foundry.utils.mergeObject(
      defaultRecipeData(),
      stored,
      { inplace: false }
    );

    const itemPrice = 0;

    const existingResultReward = data.resultUuid
      ? [{ uuid: data.resultUuid, quantity: Number(data.resultQuantity) || 1 }]
      : [];
    return {
      ...data,
      categories: parseCategories(data.categories),
      enabled: data.enabled !== false,
      isCustom: true,
      itemPrice,
      goldCost: round(itemPrice * 0.5, 4),
      progressCost: round(itemPrice, 4),
      resultUuid: data.resultUuid ?? "",
      resultQuantity: Number(data.resultQuantity) || 1,
      ingredients: Array.isArray(data.ingredients)
        ? data.ingredients
        : [],
      requiredProgress: Math.max(
        0.0001,
        Number(Object.hasOwn(stored, "requiredProgress")
          ? stored.requiredProgress
          : itemPrice) || 0.0001
      ),
      rewards: Array.isArray(data.rewards) && data.rewards.length
        ? data.rewards
        : existingResultReward,
      completionCosts: Array.isArray(data.completionCosts) ? data.completionCosts : [],
      allowedChecks: normalizeChecks(data.allowedChecks),
      rollTable: Array.isArray(data.rollTable)
        ? data.rollTable.map(row => ({
          ...row,
          enabled: row.natural1 || row.natural20 ? row.enabled !== false : true,
          natural1: Boolean(row.natural1),
          natural20: Boolean(row.natural20)
        }))
        : [],
      requiredTools: Array.isArray(data.requiredTools) ? data.requiredTools : []
    };
  }

  const uuid = explicitUuid || sourceUuid(item);
  const price = getItemPriceGp(item);

  return {
    enabled: true,
    isCustom: false,
    resultUuid: uuid,
    resultQuantity: 1,
    itemPrice: price,
    progressCost: price,
    requiredProgress: Math.max(0.0001, price),
    goldCost: round(price * 0.5, 4),
    ingredients: [],
    description: item?.system?.description?.value ?? "",
    categories: [],
    repeatable: true,
    allowedChecks: [],
    requiredTools: [],
    completionCosts: [],
    rewards: uuid ? [{ uuid, quantity: 1 }] : [],
    rollTable: [],
    conditions: []
  };
}

export function defaultStationData() {
  const data = foundry.utils.deepClone(DEFAULT_STATION_CONFIG);
  const adapter = getSystemAdapter();
  data.allowedChecks = adapter.getCheckDefinitions().map(({ type, key }) => ({ type, key }));
  if (!adapter.capabilities.checks) data.requiresRoll = false;
  return data;
}

export function normalizeChecks(checks = []) {
  return (Array.isArray(checks) ? checks : [])
    .map(check => {
      if (typeof check === "string") {
        const [type, key] = check.split(":");
        return { type, key };
      }
      return { type: check?.type, key: check?.key };
    })
    .filter(check => check.type && check.key);
}
