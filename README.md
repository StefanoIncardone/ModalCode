# Bringing together the best of Modal editors and VsCode

A simple extension to define custom editor modes inspired by
[ModalEdit](https://github.com/johtela/vscode-modaledit) and
[ModalKeys](https://github.com/haberdashPI/vscode-modal-keys) extensions.

## Extension Settings

- `Available modes`, `modalcode.modes`: array of user-defined modes objects as follows:

    ```jsonc
    // in settings.json
    "modalcode.modes": [
        // the first mode in order of definition will be selected as the starting mode
        {
            // minimum of 1 character, maximum of 16 characters
            "name": "NORMAL", // creates a status bar item "-- NORMAL --"

            // if the mode should capture typing events
            "capturing": true
        }
    ]
    ```

## Extension Commands

- `Select mode`: select mode through a quick-pick panel
- `modalcode.select`:

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
    },
    ```

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
