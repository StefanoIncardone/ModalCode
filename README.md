# Bringing together the best of Modal editors and VsCode

A simple extension to define custom editor modes inspired by
[ModalEdit](https://github.com/johtela/vscode-modaledit) and
[ModalKeys](https://github.com/haberdashPI/vscode-modal-keys) extensions.

## Extension Settings

- `Available modes`, `modalcode.modes`: array of user-defined modes objects

## Extension Commands

- `Select mode`, `modalcode.select_mode`: select a mode through a quick-pick panel
- `modalcode.enter_mode`: keyboard command to enter the mode specified as the argument

## Modes definitions

``` jsonc
// in settings.json
"modalcode.modes": [
    {
        "name": "NORMAL", // minimum of 1 character, maximum of 16 characters
        "capturing": true, // if the mode should capture typing events
    }
]
```

> [!NOTE]
> The first mode in order of definition will be selected as the **starting** mode

## Status bar item

The extension creates a status bar item displaying the current mode name:

```jsonc
"name": "NORMAL", // -> "-- NORMAL --"
```

## Definition of mode specific commands

The extensions exposes a contex key `modalcode.mode` when activated that stores the current mode,
so defining a mode specific keybinding would look like this:

``` jsonc
// in keybindings.json
{
 "key": "j",
 "command": "cursorDown",
 "when": "modalcode.mode == 'NORMAL' && textInputFocus"
}
```
