# vimcode

Extension to provide the possibility to add user-defined modes to vscode

## Features

Ability to define custom modes with specific commands:

``` json
"vimcode.modes" : [
    {
        // name identifier used to generate the "vimcode.enter" command and the mode name
        "name": "normal",   // "normal" -> "-- $(icon) NORMAL --"

        // optional status bar item icon. if no icon name is provided the status bar item text will only be the mode name
        "icon": "move",

        // optional parameter to create a mode that doesn't restrict typing of normal characters
        "restrictedInsert": true,   // (default: false -> free to type every character)

        // list of commands associated with the mode
        "commands": [
            {
                "key": "i",
                "command": "vimcode.enterinsert"
            }
        ]
    }
]
```

## Requirements

None

## Extension Settings

- `Available modes`: list of every user-defined mode
