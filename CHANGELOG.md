# Change Log

## Known issues

- Incorrect icon names specified in the `icon` mode setting will not display an icon,
    hence a way of checking for erroneous icon names need to get implemented

## Unreleased

- Add setting to choose what happens when the starting mode is not found:
    - **fail**: stop activating the extension
    - **use first**: quietly use the first mode in the list
    - **warn and use first**: warn of starting mode not found and notify the use of the first mode in the list
- Add setting to choose what happens when the modalcode.enter_mode mode is not found:
    - **keep current**: keep the current mode selected
    - **warn and keep current**: warn of mode not found and notify the use of the first mode in the list
    - **use first**: quietly use the first mode in the list
    - **warn and use first**: warn of mode not found and notify the use of the first mode in the list
- Add modes colors customization

## 0.1.0

### Added

- Added ability to define custom modes in `modalcode.modes` setting:
    - `name`: the name of the mode
    - `icon`: status bar item icon, shown next to the name
    - `capturing`: wether the mode captures typing inputs
        - `true`: modes that just type the pressed key, just like default VsCode
        - `false`: modes that execute commands
- Added choosing starting mode with `modalcode.starting_mode` setting:
    - Property to set the mode in which the editor will be in
    - If no mode is set as the starting mode then the first mode in order of definition is chosen
- Added validation for config objects:
    - The extension will not activate if any errors are discovered:
    - Property names
    - Property types and values
    - Unrecognized (extra or mispelled) properties
- Added status bar item showing the current mode:
    - Clicking on the status bar item lets you change mode
- Added command `modalcode.change_mode` (`ModalCode: Change mode`) to change modes
