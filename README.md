# Downtime Manager

Downtime Manager is a configurable downtime, project, crafting, and session-reward framework for Foundry Virtual Tabletop.

Game Masters can build reusable downtime stations, define projects with costs and rewards, distribute downtime through sessions or direct grants, and monitor character progress from a central dashboard. Players spend their characters' downtime on the projects available at a station.

> **Project status:** Pre-1.0 development release. The module is usable, but public release hardening and broader system support are still in progress.

## Features

- Actor-based downtime stations with their own name, description, availability, and optional required tool
- Configurable progress formulas using base progress, character level, proficiency bonus, check proficiency or expertise, modifiers, and station-specific character values
- Optional system-native checks at configurable intervals
- Result tables with fixed Natural 1 and Natural 20 rows, numeric ranges, progress modifiers, reward modifiers, and station-value changes
- World-level and personal downtime projects stored as Items
- Project ingredients, required tools, completion costs, Item rewards, repeatability, and optional completion checks
- Project-specific result tables that override the station table
- Draft-based project creation: no Item is created until the editor is saved
- Project library for creating, editing, reviewing, and safely deleting projects independently of a station
- Built-in project templates for crafting, research, work, training, and recovery
- GM dashboard for active progress, pending checks, completed projects, cancellation, and direct downtime grants
- Session manager with level-based Item rewards, optional milestones, history, and player selection
- Weekly or monthly passive downtime for characters who miss sessions
- Redeemable downtime Items with native system-use integration where supported
- Integrated English and German help page
- English and German localization
- Vibe Code

## Requirements and compatibility

| Component | Support |
| --- | --- |
| Foundry VTT | Version 13 minimum and verified |
| Black Flag | Full adapter: checks, character sources, currency, Item quantities, prices, and native downtime-Item use |
| Other systems | Generic adapter: core downtime and projects work, but system-specific checks, currency, and native Item use are unavailable unless another adapter is registered |

## Installation

Install the latest release in Foundry using this manifest URL:

```text
https://raw.githubusercontent.com/RedPandaSweg/downtime-manager/main/module.json
```

For a manual installation:

1. Copy the repository into the Foundry user-data directory under `Data/modules/downtime-manager`.
2. Keep the module folder name exactly `downtime-manager`.
3. Restart Foundry VTT.
4. Enable **Downtime Manager** in the world's module management screen.

## GM quick start

1. Open **Game Settings → Configure Settings → Module Settings → Downtime Manager → Default Items**.
2. Drop a valid Item into **Project base Item**. New project Items and templates copy this document so they use a type supported by the active game system.
3. Optionally configure the default cost Item.
4. Open **Project Library** from the module settings or from the Downtime Overview.
5. Create a blank project or choose a template, configure at least one reward Item, and save it.
6. Open an Actor that should act as a station and use the hammer control in its sheet header to make it a downtime station.
7. Configure the station and assign projects under **Public Projects**.
8. Grant downtime from the Downtime Overview or Session Manager.

The complete in-game guide is available under **Module Settings → Downtime Manager → Introduction and Help**.

## Player workflow

1. Open a downtime station through its Actor or token.
2. Select the character who will use the station.
3. Start an available project.
4. Invest available downtime.
5. Resolve a check when the station requests one.
6. If configured, pass the project's completion check after reaching its progress target.
7. On success, the module consumes completion costs and grants the configured Item rewards.

## Stations

A station is a normal Actor carrying a `flags.downtime-manager.station` configuration. Its configuration controls:

- available projects and checks;
- progress per invested downtime;
- roll requirements and intervals;
- the station result table;
- level, proficiency, and check-proficiency contributions;
- additive and multiplicative modifiers;
- an optional required tool;
- an optional per-character station value with tiers and changes.

Double-clicking a station token opens the station interface instead of the normal Actor sheet.

## Projects

Downtime projects are Items carrying the `flags.downtime-manager.recipe` configuration. World projects are managed in the Project Library and can be assigned to multiple stations. Embedded project Items on a character act as personal projects and require at least one category matching the current station. Publicly assigned projects are always allowed.

Project configuration can include:

- required total progress and repeatability;
- required tools;
- ingredients consumed when the project starts;
- costs consumed only on successful completion;
- one or more Item rewards;
- a project-specific result table;
- an optional completion check with a DC and downtime cost for retries.

The first completion-check attempt is free. Failed attempts preserve progress and resources; later attempts cost the configured downtime. Completion costs and rewards are processed only after a successful check.

New projects and templates remain local editor drafts until **Save** is pressed. Closing the editor discards the draft without creating an Item.

## Downtime distribution

GMs can open the **Downtime Manager** from its own control group at the bottom of the left canvas toolbar, directly below Journal Notes. The group provides access to the Downtime Overview and Session Manager without requiring a selected token.

Downtime can enter a character's balance in four ways:

- **Direct downtime:** a GM grants a flat amount to selected characters or everyone from the dashboard.
- **Session rewards:** configured Item rewards can include downtime Items for each character level.
- **Passive downtime:** non-participants accumulate a configurable share of their level's downtime reward during a weekly or monthly period.
- **Redeemable Items:** an owned Item grants its configured downtime when used or redeemed.

## Session management

The Session Manager supports:

- manual, connected-user, and controlled-token character selection;
- multiple independently toggleable Item-reward columns;
- optional milestone distribution;
- reward multipliers;
- optional Journal history;
- weekly or monthly passive-downtime accounting.

When session history is disabled, a title and description are optional and the session does not need to be saved before rewards are distributed.

## Data storage

The module uses Foundry-native documents and flags:

- station configuration is stored on the station Actor;
- project configuration is stored on the project Item;
- character downtime, project progress, interval state, and station-specific values are stored on the character Actor;
- session configuration and global defaults use world settings;
- optional session history uses Journal entries.

Deleting a project through the Project Library removes its station assignments and associated saved character progress after confirmation. Spent downtime and resources are not refunded.

## System adapters

System-dependent behavior is isolated in `scripts/system-adapter.js`. An adapter supplies checks, character values, Item quantities, prices, currency operations, and native activation hooks.

External integrations can register an adapter after module initialization:

```js
game.downtimeManager.registerSystemAdapter("system-id", () => new MySystemAdapter());
```

Unsupported systems automatically use the generic adapter. The generic adapter deliberately avoids guessing system-specific data paths.

## Public API

After Foundry's `ready` hook, the module exposes `game.downtimeManager` with helpers for opening the dashboard, station configuration, session manager, project library, project editor, and registering system adapters.

## Contributing

Bug reports should include:

- Foundry version;
- game-system name and version;
- module version;
- whether the action was performed as GM or player;
- the relevant Actor, station, and project setup;
- reproduction steps and the complete browser-console error.

Contributions for additional system adapters, automated tests, localization, and accessibility improvements are welcome.

## License

Downtime Manager is available under the [MIT License](LICENSE). You may use, modify, distribute, sublicense, and sell copies of the software as long as the copyright and license notice are retained.
