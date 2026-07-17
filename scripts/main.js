import { createDefaultSessionRewards, DEFAULT_PASSIVE_DOWNTIME, FLAGS, MODULE_ID, SETTINGS } from "./constants.js";
import { StationApp } from "./station-app.js";
import { StationConfigApp } from "./station-config-app.js";
import { ModuleItemSettingsApp } from "./module-item-settings-app.js";
import { HelpApp } from "./help-app.js";
import { ProjectLibraryApp } from "./project-library-app.js";
import { DowntimeDashboardApp } from "./dashboard-app.js";
import { getSystemAdapter, registerSystemAdapter } from "./system-adapter.js";
import { SessionApp } from "./session-app.js";
import { DowntimeItemApp } from "./downtime-item-app.js";
import { downtimeItemData, DowntimeItemService } from "./downtime-item-service.js";
import { addHeaderControl, defaultStationData, isRecipeItem, isStation } from "./utils.js";
import {
  configureAsRecipe,
  createRecipeFromBaseItem,
  openRecipeEditor
} from "./recipe-service.js";

function documentFromApp(app, documentName) {
  const document =
    app?.actor ??
    app?.item ??
    app?.document ??
    app?.object;

  return document?.documentName === documentName
    ? document
    : null;
}

function openStation(actor) {
  if (!isStation(actor)) {
    return ui.notifications.warn(
      game.i18n.localize("DOWNTIME_MANAGER.Errors.NotStation")
    );
  }

  new StationApp(actor).render(true);
}

function openDashboard() {
  if (game.user.isGM) new DowntimeDashboardApp().render(true);
}

function openSessionManager() {
  if (game.user.isGM) new SessionApp().render(true);
}

function openProjectLibrary() {
  if (game.user.isGM) new ProjectLibraryApp().render(true);
}

async function configureStation(actor, app = null) {
  if (game.user.isGM) {
    if (!isStation(actor)) {
      await actor.setFlag(MODULE_ID, FLAGS.STATION, defaultStationData());
      app?.render?.();
    }
    new StationConfigApp(actor).render(true);
  }
}

function registerTokenDoubleClick() {
  const TokenClass = CONFIG.Token.objectClass;
  const prototype = TokenClass?.prototype;

  if (!prototype) {
    console.error(`${MODULE_ID} | Token class is unavailable.`);
    return;
  }

  if (prototype.__downtimeManagerDoubleClickPatched) return;

  const original = prototype._onClickLeft2;

  if (typeof original !== "function") {
    console.error(
      `${MODULE_ID} | Token._onClickLeft2 is unavailable.`
    );
    return;
  }

  Object.defineProperty(
    prototype,
    "__downtimeManagerDoubleClickPatched",
    {
      value: true,
      configurable: true
    }
  );

  prototype._onClickLeft2 = function (event) {
    if (isStation(this.actor)) {
      openStation(this.actor);
      return;
    }

    return original.call(this, event);
  };

}

Hooks.once("init", async () => {
  registerTokenDoubleClick();

  await loadTemplates();

  game.settings.register(MODULE_ID, SETTINGS.ACTIVE_SESSION, { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SETTINGS.SESSION_REWARDS, { scope: "world", config: false, type: Object, default: createDefaultSessionRewards(getSystemAdapter().getDefaultGoldItemUuid()) });
  game.settings.register(MODULE_ID, SETTINGS.SESSION_HISTORY_JOURNAL, { scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, SETTINGS.SESSION_HISTORY_ENABLED, {
    name: "DOWNTIME_MANAGER.Settings.SessionHistory.Name",
    hint: "DOWNTIME_MANAGER.Settings.SessionHistory.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, SETTINGS.PASSIVE_DOWNTIME, {
    scope: "world", config: false, type: Object,
    default: foundry.utils.deepClone(DEFAULT_PASSIVE_DOWNTIME)
  });
  game.settings.register(MODULE_ID, SETTINGS.LAST_DIRECT_DOWNTIME_ALL, {
    scope: "world", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, SETTINGS.RECIPE_BASE_ITEM_UUID, {
    name: "DOWNTIME_MANAGER.Settings.ProjectBaseItem.Name",
    hint: "DOWNTIME_MANAGER.Settings.ProjectBaseItem.Hint",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_COST_ITEM_UUID, {
    name: "DOWNTIME_MANAGER.Settings.DefaultCostItem.Name",
    hint: "DOWNTIME_MANAGER.Settings.DefaultCostItem.Hint",
    scope: "world",
    config: false,
    type: String,
    default: getSystemAdapter().getDefaultGoldItemUuid()
  });

  game.settings.registerMenu(MODULE_ID, "itemDefaults", {
    name: "DOWNTIME_MANAGER.Settings.ItemDefaults.Name",
    label: "DOWNTIME_MANAGER.Settings.ItemDefaults.Label",
    hint: "DOWNTIME_MANAGER.Settings.ItemDefaults.Hint",
    icon: "fa-solid fa-box-open",
    type: ModuleItemSettingsApp,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "help", {
    name: "DOWNTIME_MANAGER.Help.SettingName",
    label: "DOWNTIME_MANAGER.Help.SettingLabel",
    hint: "DOWNTIME_MANAGER.Help.SettingHint",
    icon: "fa-solid fa-circle-question",
    type: HelpApp,
    restricted: false
  });

  game.settings.registerMenu(MODULE_ID, "projectLibrary", {
    name: "DOWNTIME_MANAGER.ProjectLibrary.SettingName",
    label: "DOWNTIME_MANAGER.ProjectLibrary.SettingLabel",
    hint: "DOWNTIME_MANAGER.ProjectLibrary.SettingHint",
    icon: "fa-solid fa-scroll",
    type: ProjectLibraryApp,
    restricted: true
  });

});

Hooks.once("ready", () => {
  getSystemAdapter().registerHooks({
    redeemDowntimeItem: (item, options) => DowntimeItemService.redeem(item, options)
  });
  game.downtimeManager = {
    openStation,
    configureStation,
    openRecipeEditor,
    configureAsRecipe,
    createRecipeFromBaseItem,
    openDashboard,
    openSessionManager,
    openProjectLibrary,
    getSystemAdapter,
    registerSystemAdapter
  };
});

async function loadTemplates() {
  return foundry.applications.handlebars.loadTemplates([
    "modules/downtime-manager/templates/partials/item-list.hbs",
  ]);
}

function actorHeaderControls(app, controls) {
  if (!game.user.isGM) return;

  const actor = documentFromApp(app, "Actor");
  if (!actor) return;

  addHeaderControl(controls, {
    action: "downtime-manager-configure-station",
    icon: "fa-solid fa-hammer",
    label: game.i18n.localize(isStation(actor)
      ? "DOWNTIME_MANAGER.Headers.ConfigureStation"
      : "DOWNTIME_MANAGER.Headers.MakeStation"),
    visible: true,
    onClick: () => configureStation(actor, app)
  });

  if (isStation(actor)) {
    addHeaderControl(controls, {
      action: "downtime-manager-open-station",
      icon: "fa-solid fa-screwdriver-wrench",
      label: game.i18n.localize("DOWNTIME_MANAGER.Headers.OpenStation"),
      visible: true,
      onClick: () => openStation(actor)
    });
  }
}

function itemHeaderControls(app, controls) {
  const item = documentFromApp(app, "Item");
  if (!item) return;
  const isDowntimeItem = Boolean(downtimeItemData(item));
  if (!game.user.isGM && !(isDowntimeItem && item.isOwner)) return;

  addHeaderControl(controls, {
    action: "downtime-manager-configure-item",
    icon: isRecipeItem(item) ? "fa-solid fa-scroll" : "fa-solid fa-hourglass-half",
    label: game.i18n.localize(isRecipeItem(item)
      ? "DOWNTIME_MANAGER.Headers.ConfigureProject"
      : isDowntimeItem
        ? "DOWNTIME_MANAGER.DowntimeItem.Configure"
        : "DOWNTIME_MANAGER.DowntimeItem.ConfigureGeneric"),
    visible: true,
    onClick: async () => {
      try {
        if (isRecipeItem(item)) openRecipeEditor(item);
        else new DowntimeItemApp(item).render(true);
      } catch (error) {
        console.error(error);
        ui.notifications.error(error.message);
      }
    }
  });
}

Hooks.on("getHeaderControlsActorSheetV2", actorHeaderControls);
Hooks.on("getHeaderControlsItemSheetV2", itemHeaderControls);

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  actorHeaderControls(app, controls);
  itemHeaderControls(app, controls);
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM) return;

  controls.downtimeManager = {
    name: "downtimeManager",
    order: 999,
    title: "DOWNTIME_MANAGER.Controls.Title",
    icon: "fa-solid fa-hourglass-half",
    tools: {
      dashboard: {
        name: "dashboard",
        order: 1,
        title: "DOWNTIME_MANAGER.Controls.OpenDashboard",
        icon: "fa-solid fa-chart-simple",
        button: true,
        onChange: openDashboard
      },
      session: {
        name: "session",
        order: 2,
        title: "DOWNTIME_MANAGER.Controls.OpenSessionManager",
        icon: "fa-solid fa-campground",
        button: true,
        onChange: openSessionManager
      }
    },
    activeTool: null
  };
});
