# Change Log

All notable changes to this project will be documented in this file

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
but may switch to [CalVer Versioning](https://calver.org/) in the future.

## Known issues

- Incorrect icon names specified in the `icon` mode setting will not display an icon, would want to
    report an error/warning instead
- Duplicate mode names does not raise a warning in vscode

## Unreleased

- Status bar item color customization
- Status bar item text padding to avoid shifting icons to the right

## 0.1.2 -

### Removed

- Removed icon in bar item text to avoid inconsistencies and unexpected behaviours

## 0.1.1 - 2025/21/02

### Added

- Added schema validation for `modalcode.modes` setting

### Changed

- Made `modalcode.enter_mode` just enters the mode specified as the first argument
- `modalcode.enter_mode` with no/undefined argument is now `modalcode.select_mode`

### Removed

- Removed `modalcode.starting_mode`, the starting mode is now always the first in order of definition

## 0.1.0 - 2024/11/10

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
