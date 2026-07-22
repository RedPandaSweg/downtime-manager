# Downtime Manager

Downtime Manager adds a complete downtime framework to Foundry Virtual Tabletop. Game Masters create stations and projects, distribute downtime, and keep track of character progress. Players use their downtime directly through the stations available in the world.

## Features

- Configurable downtime stations for activities such as crafting, research, training, work, and carousing
- Individual and collaborative projects with costs, checks, progress, and rewards
- Ready-to-use station and project templates
- Session rewards, passive downtime, and direct downtime grants
- Central overview for active and completed projects
- Optional Actor folder filter for player selection
- English and German interface and help page

## Compatibility

- Foundry VTT 13
- Full system integration for Black Flag
- Core downtime and project features are available through a generic adapter on other systems; system-specific checks, currency, and Item automation may be limited

## Installation

Install the module in Foundry using this manifest URL:

```text
https://raw.githubusercontent.com/RedPandaSweg/downtime-manager/main/module.json
```

Alternatively, download the release archive and extract it as `downtime-manager` under `Data/modules` in your Foundry user-data directory.

## Quick start

1. Open **Game Settings → Configure Settings → Module Settings** and read **Introduction and Help**.
2. In **Downtime Manager Configuration**, select a **Project base Item**. It provides the system-compatible Item type and base data used when new projects are created.
3. Import a station preset or turn an Actor into a downtime station through the hammer button in its sheet header.
4. Configure the station and create or assign projects under **Public Projects**.
5. Grant downtime through the Downtime Overview or Session Manager.

Players can then open a station, start a project, and invest their available downtime. To open a station as a user, a GM selects that user's character token, holds **Shift**, and opens the station.

## License

Downtime Manager is available under the [MIT License](LICENSE).
