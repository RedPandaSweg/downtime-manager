import { FLAGS, MODULE_ID } from "./constants.js";
import { DowntimeService } from "./downtime-service.js";
import { GoldService } from "./gold-service.js";
import { ProjectService } from "./project-service.js";
import { ResourceService } from "./resource-service.js";
import { RewardService } from "./reward-service.js";
import { StationEngine } from "./station-engine.js";
import { getStationData, round } from "./utils.js";
import { getSystemAdapter } from "./system-adapter.js";

export class SharedProjectService {
  static get(stationActor) {
    const stored = stationActor.getFlag(MODULE_ID, FLAGS.SHARED_PROJECTS);
    return Array.isArray(stored) ? foundry.utils.deepClone(stored) : [];
  }

  static find(stationActor, projectUuid) {
    return this.get(stationActor).find(state => state.projectUuid === projectUuid && !state.completed) ?? null;
  }

  static async #documents(stationUuid, projectUuid, actorUuid = "") {
    const stationActor = await fromUuid(stationUuid);
    const actor = actorUuid ? await fromUuid(actorUuid) : null;
    const { item, definition } = await ProjectService.project(projectUuid);
    if (!stationActor || stationActor.documentName !== "Actor") throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.NotStation"));
    return { stationActor, station: getStationData(stationActor), actor, item, definition };
  }

  static #state(states, projectUuid) {
    const state = states.find(entry => entry.projectUuid === projectUuid && !entry.completed);
    if (!state) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedProjectMissing"));
    return state;
  }

  static async start({ stationUuid, projectUuid, leaderUuid, batches = 1 }) {
    const { stationActor, actor: leader, item, definition } = await this.#documents(stationUuid, projectUuid, leaderUuid);
    if (!leader) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    if (!definition.collaborative) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ProjectNotCollaborative"));
    const states = this.get(stationActor);
    if (states.some(state => state.projectUuid === projectUuid && !state.completed)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedProjectExists"));
    if (!definition.repeatable && states.some(state => state.projectUuid === projectUuid && state.completed && state.leaderUuid === leaderUuid)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ProjectAlreadyCompleted"));
    const quantity = Math.max(1, Math.floor(Number(batches) || 1));
    if (!(definition.rewards?.length || definition.characterRewards?.length)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.RewardRequired"));
    if (!(await ResourceService.has(leader, definition.ingredients ?? [], quantity))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ResourcesMissing"));
    const gold = round(Number(definition.goldCost ?? 0) * quantity, 6);
    if (getSystemAdapter().capabilities.currency && gold > 0 && !(await GoldService.spendGold(leader, gold))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.GoldMissing"));
    if (!(await ResourceService.spend(leader, definition.ingredients ?? [], quantity))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ResourcesMissing"));
    const state = {
      id: foundry.utils.randomID(), projectUuid, projectName: item.name,
      leaderUuid, participantUuids: [leaderUuid], contributions: { [leaderUuid]: { downtime: 0, progress: 0 } },
      progress: 0, intervalProgress: 0, pendingRoll: false, awaitingCompletionCheck: false,
      completed: false, batches: quantity, requiredProgress: round(Number(definition.requiredProgress) * quantity, 6), createdAt: Date.now()
    };
    states.push(state);
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return state;
  }

  static async join({ stationUuid, projectUuid, actorUuid }) {
    const { stationActor, actor } = await this.#documents(stationUuid, projectUuid, actorUuid);
    if (!actor) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.ActorMissing"));
    const states = this.get(stationActor);
    const state = this.#state(states, projectUuid);
    if (!state.participantUuids.includes(actorUuid)) state.participantUuids.push(actorUuid);
    state.contributions[actorUuid] ??= { downtime: 0, progress: 0 };
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return state;
  }

  static async leave({ stationUuid, projectUuid, actorUuid }) {
    const { stationActor } = await this.#documents(stationUuid, projectUuid);
    const states = this.get(stationActor);
    const state = this.#state(states, projectUuid);
    if (state.leaderUuid === actorUuid) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedLeaderCannotLeave"));
    state.participantUuids = state.participantUuids.filter(uuid => uuid !== actorUuid);
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return state;
  }

  static async cancel({ stationUuid, projectUuid, actorUuid, isGM = false }) {
    const { stationActor } = await this.#documents(stationUuid, projectUuid);
    const states = this.get(stationActor);
    const state = this.#state(states, projectUuid);
    if (!isGM && state.leaderUuid !== actorUuid) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedLeaderRequired"));
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states.filter(entry => entry.id !== state.id));
    return state;
  }

  static async invest({ stationUuid, projectUuid, actorUuid, amount, check = null }) {
    const { stationActor, station, actor, definition } = await this.#documents(stationUuid, projectUuid, actorUuid);
    const states = this.get(stationActor);
    const state = this.#state(states, projectUuid);
    if (!state.participantUuids.includes(actorUuid)) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedParticipantRequired"));
    if (state.pendingRoll || state.awaitingCompletionCheck) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.RollRequired"));
    const maximum = StationEngine.maxInvestment(station, state, DowntimeService.get(actor));
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0 || requested > maximum + 1e-9) throw new Error(game.i18n.format("DOWNTIME_MANAGER.Errors.InvalidDowntime", { maximum }));
    if (!(await DowntimeService.spend(actor, requested))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.DowntimeMissing"));
    state.intervalProgress = round(state.intervalProgress + requested, 6);
    state.lastContributorUuid = actorUuid;
    state.contributions[actorUuid].downtime = round(state.contributions[actorUuid].downtime + requested, 6);
    const reaches = state.intervalProgress >= Math.max(0.000001, Number(station.rollInterval) || 1) - 1e-9;
    state.pendingRoll = reaches && station.requiresRoll !== false;
    if (reaches && station.requiresRoll === false) await this.#resolve({ stationActor, station, actor, definition, states, state, check, row: { label: "", addition: 0, multiplier: 1, rewardAddition: 0, rewardMultiplier: 1, actorValueChange: 0 }, rolled: null });
    else await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return state;
  }

  static async resolveRoll({ stationUuid, projectUuid, actorUuid, check, rolled }) {
    const { stationActor, station, actor, definition } = await this.#documents(stationUuid, projectUuid, actorUuid);
    const states = this.get(stationActor);
    const state = this.#state(states, projectUuid);
    if (!state.participantUuids.includes(actorUuid) || !state.pendingRoll) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.RollNotReady"));
    if (state.lastContributorUuid !== actorUuid) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.SharedContributorRollRequired"));
    const allowed = new Set(StationEngine.availableChecks(station, definition).map(StationEngine.checkId));
    if (!allowed.has(StationEngine.checkId(check))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.CheckNotAllowed"));
    const row = StationEngine.resolveRoll(StationEngine.rollConfiguration(station, definition), rolled);
    if (!row) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.RollResultMissing"));
    return this.#resolve({ stationActor, station, actor, definition, states, state, check, row, rolled });
  }

  static async #resolve({ stationActor, station, actor, definition, states, state, check, row, rolled }) {
    const value = RewardService.getStationValue(actor, stationActor, station);
    const calculation = StationEngine.calculateProgress({ station, downtime: state.intervalProgress, rollRow: row, actorValue: value, actorSources: StationEngine.actorProgressSources(actor, check) });
    const valueModifier = StationEngine.actorValueModifier(station, value);
    const rewardRow = { ...row, rewardAddition: Number(row.rewardAddition ?? 0) + valueModifier.rewardAddition, rewardMultiplier: Number(row.rewardMultiplier ?? 1) * valueModifier.rewardMultiplier };
    state.progress = round(Math.max(0, state.progress + calculation.progress), 6);
    state.contributions[actor.uuid].progress = round(state.contributions[actor.uuid].progress + calculation.progress, 6);
    state.intervalProgress = 0; state.pendingRoll = false;
    state.lastResult = { total: rolled?.total, natural: rolled?.natural, label: row.label, calculation };
    await RewardService.changeStationValue(actor, stationActor, station, Number(row.actorValueChange ?? 0));
    if (state.progress >= state.requiredProgress - 1e-9) {
      if (definition.completionCheck?.enabled) {
        state.awaitingCompletionCheck = true; state.completionRow = foundry.utils.deepClone(rewardRow);
      } else await this.#complete({ stationActor, station, definition, states, state, row: rewardRow });
    }
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return { state, row, calculation, rolled };
  }

  static async completionRoll({ stationUuid, projectUuid, actorUuid, check, rolled }) {
    const { stationActor, station, actor, definition } = await this.#documents(stationUuid, projectUuid, actorUuid);
    const states = this.get(stationActor); const state = this.#state(states, projectUuid);
    if (!state.participantUuids.includes(actorUuid) || !state.awaitingCompletionCheck) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.CompletionCheckNotReady"));
    const allowed = new Set(StationEngine.availableChecks(station, definition).map(StationEngine.checkId));
    if (!allowed.has(StationEngine.checkId(check))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.CheckNotAllowed"));
    const retry = state.completionCheckFailed ? Math.max(0, Number(definition.completionCheck?.retryDowntime ?? 1)) : 0;
    if (retry && !(await DowntimeService.spend(actor, retry))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.DowntimeMissing"));
    const dc = Math.max(0, Number(definition.completionCheck?.dc ?? 10));
    const success = Number(rolled.total) >= dc;
    state.lastCompletionCheck = { total: rolled.total, natural: rolled.natural, dc, success, actorUuid };
    if (success) await this.#complete({ stationActor, station, definition, states, state, row: state.completionRow ?? {} });
    else state.completionCheckFailed = true;
    await stationActor.setFlag(MODULE_ID, FLAGS.SHARED_PROJECTS, states);
    return { state, rolled, dc, success, retryCost: retry };
  }

  static async #complete({ stationActor, station, definition, states, state, row }) {
    const leader = await fromUuid(state.leaderUuid);
    const costs = definition.completionCosts ?? [];
    if (!(await ResourceService.has(leader, costs, state.batches))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.CompletionCostsMissing"));
    const rewardItems = (definition.rewards ?? []).map(reward => ({ ...reward, quantity: StationEngine.calculateRewardQuantity(reward.quantity ?? 1, row, state.batches) }));
    await RewardService.validateItems(rewardItems); RewardService.validateCharacterRewards(definition.characterRewards ?? []);
    if (!(await ResourceService.spend(leader, costs, state.batches))) throw new Error(game.i18n.localize("DOWNTIME_MANAGER.Errors.CompletionCostsMissing"));
    await RewardService.grantItems(leader, rewardItems); await RewardService.grantCharacterRewards(leader, definition.characterRewards ?? []);
    await RewardService.changeStationValue(leader, stationActor, station, Number(station.actorValue?.completionChange ?? 0));
    state.awaitingCompletionCheck = false; state.completionCheckFailed = false;
    if (definition.repeatable) state.progress = 0;
    else state.completed = true;
  }
}
