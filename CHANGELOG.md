# Change Log

## Known issues

- Incorrect icon names specified in the `icon` mode setting will not display an icon

## Unreleased

- Status bar item color customization

## 0.1.1 -

### Changed

- Made `modalcode.enter_mode` just enters the mode specified as the first argument
- `modalcode.enter_mode` with no/undefined argument is now `modalcode.select_mode`
- An empty `modalcode.starting_mode` now selects the first mode in order of definition

## 0.1.0 - 20/02/2025

### Added

- Added ability to define custom modes in `modalcode.modes` setting:
    - `name`: the name of the mode
    - `icon`: status bar item icon, shown next to the name
    - `capturing`: wether the mode captures typing inputs
        - `true`: modes that just type the pressed key, just like default VsCode
        - `false`: modes that execute commands
- Added choosing starting mode with `modalcode.starting_mode` setting:
    - If no starting mode is set or if the specified starting mode is not found, the first mode in
        order of definition will be chosen
- Added `ModalCode: Enter mode` command (`modalcode.enter_mode`) to change modes
- Added status bar item showing the current mode:
    - Clicking on the status bar item will execute the `ModalCode: Enter mode` command
