# Bringing together the best of Modal editors and VsCode

A simple extension to define custom editor modes inspired by
[ModalEdit](https://github.com/johtela/vscode-modaledit) and
[ModalKeys](https://github.com/haberdashPI/vscode-modal-keys) extensions.

## Extension Settings

- `Available modes`, `modalcode.modes`: array of user-defined modes objects
- `Starting mode`, `modalcode.starting_mode`: the mode to select at startup

## Extension Commands

- `Select mode`, `modalcode.select_mode`: select a mode through a quick-pick panel
- `modalcode.enter_mode`: keyboard command to enter the mode specified as the argument

## Modes definitions

``` jsonc
// in settings.json
"modalcode.modes": [
    {
        "name": "NORMAL",
        "icon": "move",
        "capturing": true,
    }
]
```

The corresponding typescript interface for mode properties is:

```ts
interface ModeProperties {
    readonly name: string; // minimum of 1 character, maximum of 16 characters
    readonly icon?: string; // the icon associated with the mode
    readonly capturing: boolean; // if the mode should capture typing events
}
```

## Status bar item

The extension creates a status bar item displaying the current mode.
The displayed mode text is built from the
[icon label](https://code.visualstudio.com/api/references/icons-in-labels) and the mode name:

```jsonc
"name": "NORMAL",
"icon": "symbol-boolean"
// => "-- $(symbol-boolean) NORMAL --"
```

If no icon name is provided only the mode name will be shown:

``` jsonc
"name": "NORMAL"
// missing "icon" property
// => "-- NORMAL --"
```

If an incorrect icon name is provided no icon will be shown:

```jsonc
"name": "NORMAL",
"icon": "incorrect"
// => "-- NORMAL --"
```

## Starting mode

Used to set the mode in which the editor will first be in:

``` jsonc
// in settings.json
"modalcode.starting_mode": "NORMAL"
```

The first mode in order of definition will be selected if:

- no starting mode setting is present
- an empty string is set
- the specified starting mode is not found

## Definition of mode specific commands

The extensions exposes a contex key `modalcode.mode` when activated that stores the current mode,
so defining a mode specif keybinding would look like this:

``` jsonc
// in keybindings.json
{
 "key": "j",
 "command": "cursorDown",
 "when": "modalcode.mode == 'NORMAL' && textInputFocus"
}
```
