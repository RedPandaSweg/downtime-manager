import { DowntimeService } from "./downtime-service.js";
import { GoldService } from "./gold-service.js";
import { ProjectService } from "./project-service.js";
import { ResourceService } from "./resource-service.js";
import { RewardService } from "./reward-service.js";
import { StationConfigApp } from "./station-config-app.js";
import { StationEngine } from "./station-engine.js";
import { getSystemAdapter } from "./system-adapter.js";
import {
  getActiveCrafter,
  getStationData,
  hasRequiredTool,
  isRecipeItem,
  recipeData,
  round
} from "./utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function lastResultView(result, actorValueEnabled, actorValueLabel, showRewardSummary = true) {
  if (!result?.calculation) return null;
  const calculation = result.calculation;
  const parts = [];
  const addPart = (key, value, neutral, label) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number === neutral) return;
    parts.push({
      label: label ?? game.i18n.localize(`DOWNTIME_MANAGER.Calculation.${key}`),
      explanation: game.i18n.localize(`DOWNTIME_MANAGER.Calculation.${key}Help`),
      value: number,
      operation: neutral === 0 ? "add" : "multiply"
    });
  };
  addPart("BaseProgress", calculation.baseProgress, 0);
  addPart("RollAddition", calculation.rollAddition, 0);
  addPart("ActorValueAddition", calculation.flagAddition, 0, game.i18n.format(
    "DOWNTIME_MANAGER.Calculation.ActorValueAdditionLabel",
    { label: actorValueLabel }
  ));
  addPart("LevelAddition", calculation.levelAddition, 0);
  addPart("ProficiencyAddition", calculation.proficiencyAddition, 0);
  addPart("CheckProficiencyAddition", calculation.checkProficiencyAddition, 0);
  addPart("RollMultiplier", calculation.rollMultiplier, 1);
  addPart("ActorValueMultiplier", calculation.flagMultiplier, 1, game.i18n.format(
    "DOWNTIME_MANAGER.Calculation.ActorValueMultiplierLabel",
    { label: actorValueLabel }
  ));
  for (const modifier of calculation.modifierDetails ?? []) {
    const multiply = modifier.operation === "multiply";
    addPart(
      multiply ? "OtherMultipliers" : "Additional",
      modifier.value,
      multiply ? 1 : 0,
      modifier.label || game.i18n.localize(`DOWNTIME_MANAGER.Calculation.${multiply ? "OtherMultipliers" : "Additional"}`)
    );
  }
  const additions = parts.filter(part => part.operation === "add");
  const multipliers = parts.filter(part => part.operation === "multiply");
  const additiveFormula = additions.length
    ? additions.map((part, index) => {
      if (!index) return String(part.value);
      return part.value < 0 ? `− ${Math.abs(part.value)}` : `+ ${part.value}`;
    }).join(" ")
    : "0";
  const multiplierFormula = multipliers.map(part => ` × ${part.value}`).join("");
  const actorValueChange = Number(result.actorValueChange ?? 0);
  return {
    downtime: calculation.downtime,
    rollTotal: result.total,
    natural: result.natural,
    hasRoll: Number.isFinite(Number(result.total)),
    label: result.label,
    progress: calculation.progress,
    rewards: Array.isArray(result.rewards) ? result.rewards : [],
    formula: `${calculation.downtime} × (${additiveFormula})${multiplierFormula} = ${calculation.progress}`,
    parts,
    actorValueEnabled,
    hasActorValueResult: Number.isFinite(Number(result.actorValueAfter)),
    actorValueBefore: result.actorValueBefore,
    actorValueAfter: result.actorValueAfter,
    actorValueChange: actorValueChange > 0 ? `+${actorValueChange}` : actorValueChange,
    showRewardSummary
  };
}

export class StationApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "downtime-manager-station-{id}",
    classes: ["downtime-manager", "station-app"],
    position: { width: 700, height: 800 },
    window: { title: "DOWNTIME_MANAGER.Station.Title", resizable: true },
    actions: {
      start: StationApp.#start,
      deactivate: StationApp.#deactivate,
      invest: StationApp.#invest,
      roll: StationApp.#roll,
      completionRoll: StationApp.#completionRoll,
      configure: StationApp.#configure
    }
  };

  static PARTS = {
    main: { template: "modules/downtime-manager/templates/station.hbs" }
  };

  constructor(stationActor, options = {}) {
    super({ ...options, id: `downtime-manager-station-${stationActor.id}` });
    this.stationActor = stationActor;
    this._documentUpdateHooks = [
      ["updateActor", Hooks.on("updateActor", actor => {
        const crafter = getActiveCrafter();
        if (this.rendered && (actor.id === this.stationActor.id || actor.id === crafter?.id)) {
          this.render();
        }
      })],
      ...["createItem", "updateItem", "deleteItem"].map(hook => [
        hook,
        Hooks.on(hook, item => {
          const crafter = getActiveCrafter();
          if (this.rendered && item.parent?.id === crafter?.id) this.render();
        })
      ])
    ];
  }

  async close(options = {}) {
    for (const [hook, id] of this._documentUpdateHooks ?? []) {
      Hooks.off(hook, id);
    }
    this._documentUpdateHooks = [];
    return super.close(options);
  }

  async _prepareContext() {
    const actor = getActiveCrafter();
    const station = getStationData(this.stationActor);
    const adapter = getSystemAdapter();
    const base = {
      station,
      stationName: station.displayName || this.stationActor.name,
      stationDescription: station.description,
      isGM: game.user.isGM,
      disabled: !station.enabled
    };
    if (!actor) return { ...base, noActor: true };

    const sources = new Map();
    for (const uuid of station.recipes) sources.set(uuid, { uuid, personal: false });
    for (const item of actor.items.filter(isRecipeItem)) {
      sources.set(item.uuid, { uuid: item.uuid, item, personal: true });
    }

    const projects = [];
    for (const source of sources.values()) {
      const item = source.item ?? await fromUuid(source.uuid);
      if (!item || item.documentName !== "Item") continue;
      const definition = recipeData(item, { sourceUuid: source.uuid });
      const description = await TextEditor.enrichHTML(
        String(definition.description ?? ""),
        { async: true, secrets: item.isOwner, relativeTo: item }
      );
      const state = ProjectService.findState(actor, this.stationActor, source.uuid);
      const checks = StationEngine.checkDefinitions(
        StationEngine.availableChecks(station, definition)
      );
      const checkSelectionRequired = Boolean(station.progressSources?.checkProficiency?.enabled);
      const stationToolOk = hasRequiredTool(actor, station.requiredTool);
      const projectToolsOk = (definition.requiredTools ?? []).every(tool => hasRequiredTool(actor, tool));
      const startItemsOk = ResourceService.has(actor, definition.ingredients ?? []);
      const startGoldOk = !adapter.capabilities.currency || GoldService.getGold(actor) + 1e-9 >= Number(definition.goldCost ?? 0);
      const progress = Number(state?.progress ?? 0);
      const requiredProgress = Number(state?.requiredProgress ?? definition.requiredProgress);
      const maxInvestment = state
        ? StationEngine.maxInvestment(station, state, DowntimeService.get(actor))
        : 0;
      const active = Boolean(state && !state.completed && state.active !== false);
      const paused = Boolean(state && !state.completed && state.active === false);
      projects.push({
        uuid: source.uuid,
        name: item.name,
        img: item.img,
        description,
        goldCost: round(Number(definition.goldCost ?? 0), 4),
        showGoldCost: adapter.capabilities.currency && !definition.isCustom,
        personal: source.personal,
        repeatable: definition.repeatable,
        state,
        lastResult: lastResultView(
          state?.lastResult,
          Boolean(station.actorValue.enabled),
          station.actorValue.label || station.actorValue.key || game.i18n.localize("DOWNTIME_MANAGER.Station.ActorValue"),
          definition.isCustom
        ),
        active,
        paused,
        completed: Boolean(state?.completed),
        progress: round(progress, 6),
        requiredProgress: round(requiredProgress, 6),
        percent: requiredProgress > 0 ? Math.max(0, Math.min(100, Math.floor(progress / requiredProgress * 100))) : 100,
        intervalProgress: round(Number(state?.intervalProgress ?? 0), 6),
        rollInterval: station.rollInterval,
        pendingRoll: Boolean(state?.pendingRoll),
        awaitingCompletionCheck: Boolean(state?.awaitingCompletionCheck),
        completionDC: Number(definition.completionCheck?.dc ?? 10),
        completionRetryCost: state?.completionCheckFailed ? Number(definition.completionCheck?.retryDowntime ?? 1) : 0,
        completionCheckFailed: Boolean(state?.completionCheckFailed),
        lastCompletionCheck: state?.lastCompletionCheck ?? null,
        maxInvestment,
        checks,
        requiresRoll: station.requiresRoll !== false,
        showCheckSelection: checkSelectionRequired,
        canStart: station.enabled && stationToolOk && projectToolsOk &&
          Boolean(definition.rewards?.length) &&
          (paused || (startItemsOk && startGoldOk && (!state || (state.completed && definition.repeatable)))),
        canInvest: station.enabled && Boolean(active && !state.pendingRoll && !state.awaitingCompletionCheck && maxInvestment > 0 && (!checkSelectionRequired || checks.length)),
        canRoll: station.enabled && Boolean(active && state.pendingRoll && checks.length),
        canCompletionRoll: station.enabled && Boolean(active && state.awaitingCompletionCheck && checks.length && DowntimeService.get(actor) + 1e-9 >= (state.completionCheckFailed ? Number(definition.completionCheck?.retryDowntime ?? 1) : 0))
      });
    }
    projects.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return {
      ...base,
      actorName: actor.name,
      downtime: DowntimeService.get(actor),
      gold: round(GoldService.getGold(actor), 2),
      showGold: adapter.capabilities.currency,
      actorValue: RewardService.getStationValue(actor, this.stationActor, station),
      actorValueLabel: station.actorValue.label || station.actorValue.key,
      actorValueEnabled: Boolean(station.actorValue.enabled),
      projects
    };
  }

  static #configure() {
    if (game.user.isGM) new StationConfigApp(this.stationActor).render(true);
  }

  static async #start(event, target) {
    const actor = getActiveCrafter();
    if (!actor) return ui.notifications.error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    try {
      const quantity = this.element.querySelector(`[data-quantity-for="${CSS.escape(target.dataset.uuid)}"]`)?.value ?? 1;
      await ProjectService.start(actor, this.stationActor, target.dataset.uuid, quantity);
      ui.notifications.info(game.i18n.localize("DOWNTIME_MANAGER.Notifications.ProjectStarted"));
      this.render();
    } catch (error) { ui.notifications.error(error.message); }
  }

  static async #invest(event, target) {
    const actor = getActiveCrafter();
    if (!actor) return ui.notifications.error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    try {
      const input = this.element.querySelector(`[data-downtime-for="${CSS.escape(target.dataset.uuid)}"]`);
      const select = this.element.querySelector(`[data-check-for="${CSS.escape(target.dataset.uuid)}"]`);
      const [type, key] = String(select?.value ?? "").split(":");
      const result = await ProjectService.invest(actor, this.stationActor, target.dataset.uuid, input?.value, { type, key });
      ui.notifications.info(game.i18n.format(
        result.pendingRoll ? "DOWNTIME_MANAGER.Notifications.DowntimeInvestedRoll" : "DOWNTIME_MANAGER.Notifications.DowntimeInvested",
        { amount: result.used }
      ));
      this.render();
    } catch (error) { ui.notifications.error(error.message); }
  }

  static async #deactivate(event, target) {
    const actor = getActiveCrafter();
    if (!actor) return ui.notifications.error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    try {
      await ProjectService.deactivate(actor, this.stationActor, target.dataset.uuid);
      ui.notifications.info(game.i18n.localize("DOWNTIME_MANAGER.Notifications.ProjectDeactivated"));
      this.render();
    } catch (error) { ui.notifications.error(error.message); }
  }

  static async #roll(event, target) {
    const actor = getActiveCrafter();
    if (!actor) return ui.notifications.error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    const select = this.element.querySelector(`[data-check-for="${CSS.escape(target.dataset.uuid)}"]`);
    const [type, key] = String(select?.value ?? "").split(":");
    try {
      const result = await ProjectService.resolveRoll(actor, this.stationActor, target.dataset.uuid, { type, key });
      if (!result) return;
      ui.notifications.info(game.i18n.format("DOWNTIME_MANAGER.Notifications.RollResolved", {
        result: result.row.label || result.rolled.total,
        progress: result.calculation.progress
      }));
      if (result.actorValueChange) {
        ui.notifications.info(game.i18n.format(
          "DOWNTIME_MANAGER.Notifications.ActorValueChanged",
          {
            label: getStationData(this.stationActor).actorValue?.label
              || game.i18n.localize("DOWNTIME_MANAGER.Station.ActorValue"),
            change: result.actorValueChange > 0
              ? `+${result.actorValueChange}`
              : result.actorValueChange,
            value: result.actorValueAfter
          }
        ));
      }
      this.render();
    } catch (error) { ui.notifications.error(error.message); }
  }

  static async #completionRoll(event, target) {
    const actor = getActiveCrafter();
    if (!actor) return ui.notifications.error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    const select = this.element.querySelector(`[data-completion-check-for="${CSS.escape(target.dataset.uuid)}"]`);
    const [type, key] = String(select?.value ?? "").split(":");
    try {
      const result = await ProjectService.resolveCompletionCheck(actor, this.stationActor, target.dataset.uuid, { type, key });
      if (!result) return;
      ui.notifications.info(game.i18n.format(result.success
        ? "DOWNTIME_MANAGER.Notifications.CompletionCheckPassed"
        : "DOWNTIME_MANAGER.Notifications.CompletionCheckFailed", { total: result.rolled.total, dc: result.dc }));
      this.render();
    } catch (error) { ui.notifications.error(error.message); }
  }
}
