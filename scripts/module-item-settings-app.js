import { MODULE_ID, SETTINGS } from "./constants.js";
import { configuredCategories } from "./utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

async function resolveItem(uuid) {
  if (!uuid) return null;
  const item = await fromUuid(uuid);
  return item?.documentName === "Item" ? item : null;
}

export class ModuleItemSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "downtime-manager-item-settings",
    classes: ["downtime-manager", "module-item-settings"],
    tag: "form",
    position: { width: 620, height: 760 },
    window: { title: "DOWNTIME_MANAGER.Settings.ModuleConfig.Title", resizable: true },
    form: { handler: ModuleItemSettingsApp.#submit, closeOnSubmit: false },
    actions: {
      clearItem: ModuleItemSettingsApp.#clearItem,
      addCategory: ModuleItemSettingsApp.#addCategory,
      removeCategory: ModuleItemSettingsApp.#removeCategory
    }
  };

  static PARTS = {
    main: { template: "modules/downtime-manager/templates/module-item-settings.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this._draft) {
      this._draft = {
        recipeBaseItemUuid: String(game.settings.get(MODULE_ID, SETTINGS.RECIPE_BASE_ITEM_UUID) ?? ""),
        defaultCostItemUuid: String(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_COST_ITEM_UUID) ?? ""),
        categories: configuredCategories()
      };
    }
    const baseItem = await resolveItem(this._draft.recipeBaseItemUuid);
    const costItem = await resolveItem(this._draft.defaultCostItemUuid);
    return {
      ...context,
      categories: this._draft.categories,
      fields: [
        {
          setting: "recipeBaseItemUuid",
          label: game.i18n.localize("DOWNTIME_MANAGER.Settings.ProjectBaseItem.Name"),
          hint: game.i18n.localize("DOWNTIME_MANAGER.Settings.ProjectBaseItem.Hint"),
          uuid: this._draft.recipeBaseItemUuid,
          item: baseItem
        },
        {
          setting: "defaultCostItemUuid",
          label: game.i18n.localize("DOWNTIME_MANAGER.Settings.DefaultCostItem.Name"),
          hint: game.i18n.localize("DOWNTIME_MANAGER.Settings.DefaultCostItem.Hint"),
          uuid: this._draft.defaultCostItemUuid,
          item: costItem
        }
      ]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    for (const zone of this.element.querySelectorAll(".setting-item-drop")) {
      zone.addEventListener("dragover", event => event.preventDefault());
      zone.addEventListener("drop", event => this.#dropItem(event, zone.dataset.setting));
    }
  }

  async #dropItem(event, setting) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const item = data.type === "Item" ? await Item.implementation.fromDropData(data) : null;
    if (!item?.uuid) {
      return ui.notifications.warn(game.i18n.localize("DOWNTIME_MANAGER.Errors.DropItem"));
    }
    this.#captureCategories();
    this._draft[setting] = item.uuid;
    this.render();
  }

  static #clearItem(event, target) {
    this.#captureCategories();
    this._draft[target.dataset.setting] = "";
    this.render();
  }

  static #addCategory() {
    this.#captureCategories();
    this._draft.categories.push({ id: "", label: "" });
    this.render();
  }

  static #removeCategory(event, target) {
    this.#captureCategories();
    this._draft.categories.splice(Number(target.dataset.index), 1);
    this.render();
  }

  #captureCategories() {
    this._draft.categories = this._draft.categories.map((category, index) => ({
      id: String(this.element?.querySelector(`[name="categories.${index}.id"]`)?.value ?? category.id),
      label: String(this.element?.querySelector(`[name="categories.${index}.label"]`)?.value ?? category.label)
    }));
  }

  static async #submit() {
    this.#captureCategories();
    const categories = this._draft.categories.map((category, index) => ({
      id: String(category.id ?? "").trim().toLowerCase(),
      label: String(category.label ?? "").trim()
    })).filter(category => category.id && category.label);
    const unique = categories.filter((category, index) => categories.findIndex(entry => entry.id === category.id) === index);
    await game.settings.set(MODULE_ID, SETTINGS.RECIPE_BASE_ITEM_UUID, this._draft.recipeBaseItemUuid);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_COST_ITEM_UUID, this._draft.defaultCostItemUuid);
    await game.settings.set(MODULE_ID, SETTINGS.STATION_CATEGORIES, { entries: unique });
    ui.notifications.info(game.i18n.localize("DOWNTIME_MANAGER.Notifications.ItemSettingsSaved"));
    await this.close();
  }
}
