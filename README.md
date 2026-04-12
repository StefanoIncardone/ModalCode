# Bringing together the best of Modal editors and VsCode

A simple extension to define custom editor modes inspired by
[ModalEdit](https://github.com/johtela/vscode-modaledit) and
[ModalKeys](https://github.com/haberdashPI/vscode-modal-keys) extensions.

## Extension Settings

### General

#### Config change action

`modalcode.settingsChangeAction`: action to take when settings change

Possible values:

- `automatic reload`: Automatically reload without asking
- `ask to reload`: Show a notification asking if settings should be reloaded
- `no action`: Do not reload nor ask for a reload

### Editor Modes

#### Modes

`modalcode.modes`: array of user-defined modes objects

Example:

```jsonc
// in settings.json
"modalcode.modes": [
    // the first mode in order of definition will be selected as the starting mode
    {
        // minimum of 1 character, maximum of 16 characters
        "name": "NORMAL", // creates a status bar item "-- NORMAL --"

        // if the mode should capture typing events
        "capturing": true,

        // optional mode description
        "description": "Normal mode description"
    }
]
```

## Extension Commands

### Select mode

- `Select mode`, `modalcode.select`: select mode through a quick-pick panel or a keybinding

    ```jsonc
    // in keybindings.json
    {
        "key": "escape",
        "command": "modalcode.select", // enter mode "NORMAL"
        "args": "NORMAL"
    },
    {
        "key": "escape",
        "command": "modalcode.select", // show quick-pick panel to select mode
        // no args
    },
    ```

### Reload modes

- `Reload modes`, `modalcode.reload`: reload modes from the settings

## Definition of mode specific commands

When activated, the extensions exposes the `modalcode.mode` contex key that stores the current mode
`name` as defined in `modalcode.modes`, so defining a mode specific keybinding would look like this:

```jsonc
// in keybindings.json
{
    "key": "j",
    "command": "cursorDown",
    "when": "modalcode.mode == 'NORMAL' && textInputFocus"
}
```
