# Change Log

## Known issues

- setting `vimcode.enter<modename>` command to `escape` causes problems such as not deselecting selections and not
    removing multiple selections
- due to current Vs Code limitations commands cannot check for "when" conditions (like keybindings)

## \[Unreleased]

- moving keybindings definition to separate `.ts`/`.js` files to allow for greater flexibility and creation os profiles

## 0.0.1

- ability to define custom modes (name, status bar item icon, execution of vscode commands)
    - `unrestricted input`: modes that just type the pressed key
    - `restricted input`: modes that execute commands

## 1.0.0

- added validation for config objects (the extension will not initialize if any errors are discovered):
    - property names
    - property types and values
    - unrecocgnized (extra or mispelled) properties
- redifined setting of `starting mode`:
    - property to set the mode in which the editor will be in
    - if no mode is set as the starting mode then the first mode in order of definition is chosen
    - if more than one mode is set as the starting mode then the last mode in order of definition is chosen
- renamed `commands` property to `keybindings`
- redefined setting of `unrestricted input` and `restricted input` modes
    - now called `insert` and `normal` modes respectively
    - if no `keybindings` property is present the mode is now considered as an `insert mode`
    - if the `keybindings` property is present the mode is now considered as a `normal mode`

## 1.1.0

- addedd basic error reporting for modes definitions


## 1.1.1

- fixed insert mode type subscription
