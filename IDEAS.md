# Ideas

## ?.?.? - Simpler config objects

current:

```json
"modalcode.modes": [
    { "name": "NORMAL", "description": "Movement and general commands", "capturing": true, },
    { "name": "INSERT", "description": "Text writing",                  "capturing": false, },
    { "name": "RUN",    "description": "Run, debug and execute tasks",  "capturing": true, },
],
```

simpler:

```json
"modalcode.modes": {
    "NORMAL": { "description": "Movement and general commands", "capturing": true, },
    "INSERT": { "description": "Text writing",                  "capturing": false, },
    "RUN":    { "description": "Run, debug and execute tasks",  "capturing": true, },
},
```

### Problems

- json schema validation for keys lengths

## ?.?.? - Loading configs from javascript scripts (see saved for later [code](saved_for_later/extension.ts) and [configurations](saved_for_later/package.json))

## ?.?.? - Implement multiple copy/paste buffers

## ?.?.? - Implement visual line mode commands

## ?.?.? - Implement cursor alignment, to remove the "Cursor Align" extension

## ?.?.? - Implement todo-tree like features, to remove the "Better todo tree" extension

## ?.?.? - Implement toggling of quote kinds, to remove the "Toggle Quotes"

## ?.?.? - Implement project manager features, to remove "Project manager"

## ?.?.? - Implement command to generate a keybindings reset file

## ?.?.? - Provide a "reference" keybindings extension

## ?.?.? - Generate `package.json` using javascript

I like programming languages, not data transfer languages.

The actual problem is that i would like to implement `modalcode.*.changeAction` settings identical to
`modalcode.settingsChangeAction` without copy pasting it everytime, and a programming language (like typescript) would
be perfect for that because i would be able to use variables...

This could be solved by finding type definitions for the `package.json` of extensions and dump a variable with the
contents of the `package.json` in it.

Also, why would i use a language (`json`) that doesn't even support trailing commas and comments? (i'm joking... or am i?)
