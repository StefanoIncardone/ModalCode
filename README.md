# Bringing together the best of Vim and Vs Code

A simple input mode creation extension inspired by the [ModalEdit](https://github.com/johtela/vscode-modaledit) and
[ModalKeys](https://github.com/haberdashPI/vscode-modal-keys) extensions.

## Features

Simple extension to define custom vim-like modes with mode-specific commands.

## Example creation of a mode

``` jsonc
// in settings.json
"vimcode.modes": [
    {
        "name": "normal",
        "icon": "move",
        "startingMode": true,
        "keybindings": [
            {
                "key": "i",
                "command": "vimcode.enterInsert"
            }
        ]
    }
]
```

**NOTE**: The extension will not get initialized (as it was not activated) if:

- the entire `vimcode.modes` setting is missing the extension
- no modes, or duplicate modes are defined
- any spelling errors or unrecognized properties are discovered

## Naming the mode

``` jsonc
"name": "modename"
```

The mode name can only contain 1 to 16 total lower case letters and spaces in between words as leading and
trailing whitespaces are trimmed.

The mode name will be used to generate the Vs Code command to enter the mode itself: a PascalCase version of the
name will be generated and used as the command name:

``` jsonc
"name": "modename"  // => "vimcode.enterModename"
"name": "mode name" // => "vimcode.enterModeName"
```

### Status bar mode indicator text

[see all available icons](https://code.visualstudio.com/api/references/icons-in-labels "Vs Code icons in labels").

``` jsonc
"icon": "icon-label-name"
```

The displayed mode indicator text is built from the icon label name and the mode name itself:

- the mode name will be converted to all upper cases and used as the main text
- if no icon id is provided only the mode name will be shown

``` jsonc
"name": "normal"
/* missing "icon" property */
// => "-- NORMAL --"

"name": "select line",
"icon": "symbol-boolean"
// => "-- $(symbol-boolean) SELECT LINE --"
```

## Starting mode

``` jsonc
"startingMode": true    // default: false
```

Used to set the mode in which the editor will first be in:

- if no mode is specified to be the starting mode then the first mode in order of definition will be chosen
- if more than one mode is set as the starting mode then the last mode in order of definition will be chosen

## Associated Commands

``` jsonc
"keybindings": []
```

- if no keybindings property is defined the mode is considered as an `insert mode`, where it is possible to just
  insert characters as in a normal editor
- if `zero` or `more` keybindings are defined the mode is considered as a `normal mode`, where every character is a
  mode-specific command

### Keys

``` jsonc
// only single printable characters are allowed
"key":  ✅ "s"
        ✅ " "
        ✅ "\n"
        ❌ "yy"
        ❌ "ctrl+s",
```

### Commands

``` jsonc
"command": "workbench.action.files.save"
```

The command can be any valid Vs Code built-in command, or defined by this extension such as commands for entering modes.

## Requirements

- `Zod`: schema validation module

## Extension Settings

- `Available modes`: list of user-defined modes
