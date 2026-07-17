import { MODULE_ID, SETTINGS } from "./constants.js";

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
    position: { width: 560, height: "auto" },
    window: { title: "DOWNTIME_MANAGER.Settings.ItemDefaults.Title", resizable: true },
    form: { handler: ModuleItemSettingsApp.#submit, closeOnSubmit: true },
    actions: { clearItem: ModuleItemSettingsApp.#clearItem }
  };

  static PARTS = {
    main: { template: "modules/downtime-manager/templates/module-item-settings.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!this._draft) {
      this._draft = {
        recipeBaseItemUuid: String(game.settings.get(MODULE_ID, SETTINGS.RECIPE_BASE_ITEM_UUID) ?? ""),
        defaultCostItemUuid: String(game.settings.get(MODULE_ID, SETTINGS.DEFAULT_COST_ITEM_UUID) ?? "")
      };
    }
    const baseItem = await resolveItem(this._draft.recipeBaseItemUuid);
    const costItem = await resolveItem(this._draft.defaultCostItemUuid);
    return {
      ...context,
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
    const data = TextEditor.getDragEventData(event);
    const item = data.type === "Item" ? await Item.implementation.fromDropData(data) : null;
    if (!item?.uuid) {
      return ui.notifications.warn(game.i18n.localize("DOWNTIME_MANAGER.Errors.DropItem"));
    }
    this._draft[setting] = item.uuid;
    this.render();
  }

  static #clearItem(event, target) {
    this._draft[target.dataset.setting] = "";
    this.render();
  }

  static async #submit() {
    await game.settings.set(MODULE_ID, SETTINGS.RECIPE_BASE_ITEM_UUID, this._draft.recipeBaseItemUuid);
    await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_COST_ITEM_UUID, this._draft.defaultCostItemUuid);
    ui.notifications.info(game.i18n.localize("DOWNTIME_MANAGER.Notifications.ItemSettingsSaved"));
  }
}
