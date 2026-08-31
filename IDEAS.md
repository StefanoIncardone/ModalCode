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
