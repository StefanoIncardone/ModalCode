enum ModesLocation {
    Settings      = 0,
    GlobalStorage = 1,
}

namespace ModesLocation {
    export const COUNT = ModesLocation.GlobalStorage + 1;
    export const DEFAULT = new Set<ModesLocation>([
        ModesLocation.Settings,
        ModesLocation.GlobalStorage,
    ]);

    export const LABELS = {
        "settings": ModesLocation.Settings,
        "globalStorage": ModesLocation.GlobalStorage,
    } as const satisfies Record<string, ModesLocation>;
}

let modes_locations: Set<ModesLocation> = ModesLocation.DEFAULT;
let extension_context: ExtensionContext;

const MODES_CONFIG_FILE = "modes.js";

async function parse_modes_from_globalStorage(): Promise<Modes | undefined> {
    let modes_url: URL;
    try {
        modes_url = new URL(`file:${extension_context.globalStorageUri.fsPath}/${MODES_CONFIG_FILE}`);
    }
    catch (e) {
        debugger;
        vsc_window.showErrorMessage("An error has occured getting the globalStorage modes file path. Check the output for more detailed information");
        console.error(e);
        return undefined;
    }

    debugger;
    // modes_url.searchParams.append("t", Date.now().toString());;

    let modes_file: Record<string, unknown>;
    try {
        modes_file = await import(modes_url.href);
    }
    catch (e) {
        debugger;
        vsc_window.showErrorMessage("An error has occured while importing the modes definitions from globalStorage. Check the output for more detailed information");
        console.error(e);
        return undefined;
    }

    debugger;
    const exported_default_modes = modes_file["default"];

    const new_modes: Modes = new Map();

    //# Validating the config object
    if (exported_default_modes === undefined) return new_modes;
    else if (!JsonUtils.is_array(exported_default_modes as Json)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: `'${configuration.modalcode.modes.definitions.KEY}'`,
            actual_type: type_name(exported_default_modes),
            expected_type: "array",
        }));
        return undefined;
    }

    const modalcode_modes = exported_default_modes as unknown[];
    for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index];

        //# Validating the mode config object

        if (mode_config === null || typeof mode_config === "bigint" || typeof mode_config === "function" || typeof mode_config === "symbol" || mode_config === undefined) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: configuration.modalcode.modes.definitions.Properties.MODE,
                actual_type: type_name(mode_config),
                expected_type: "object",
            }, { mode_index }));
            continue;
        }
        else if (!JsonUtils.is_object(mode_config as Json)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: configuration.modalcode.modes.definitions.Properties.MODE,
                actual_type: type_name(mode_config),
                expected_type: "object",
            }, { mode_index }));
            continue;
        }

        //# Validating required properties

        const mode_config_json = mode_config as JsonObject;

        const { name: mode_name } = mode_config_json;
        delete mode_config_json["name"];

        if (mode_name === undefined) {
            vsc_window.showErrorMessage(msg_missing_property({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.NAME}'`,
            }, { mode_index }));
            continue;
        }
        else if (!JsonUtils.is_string(mode_name)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.NAME}'`,
                actual_type: JsonUtils.type_name(mode_name),
                expected_type: "string",
            }, { mode_index }));
            continue;
        }
        else if (mode_name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_min_length({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.NAME}'`,
                min: MIN_NAME_LENGTH,
            }, { mode_index, mode_name }));
            continue;
        }
        else if (mode_name.length > MAX_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_max_length({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.NAME}'`,
                max: MAX_NAME_LENGTH,
            }, { mode_index }));
            continue;
        }

        const { capturing } = mode_config_json;
        delete mode_config_json["capturing"];

        if (capturing === undefined) {
            vsc_window.showErrorMessage(msg_missing_property({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.CAPTURING}'`,
            }, { mode_index, mode_name }));
            continue;
        }
        else if (!JsonUtils.is_boolean(capturing)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: `'${configuration.modalcode.modes.definitions.Properties.CAPTURING}'`,
                actual_type: JsonUtils.type_name(capturing),
                expected_type: "boolean",
            }, { mode_index, mode_name }));
            continue;
        }

        //# Validating optional properties

        let { description } = mode_config_json;
        if (description === undefined) {
            description = "";
        }
        else if (description !== undefined) {
            delete mode_config_json["description"];

            if (!JsonUtils.is_string(description)) {
                vsc_window.showErrorMessage(msg_mismatched_type({
                    property_name: `'${configuration.modalcode.modes.definitions.Properties.DESCRIPTION}'`,
                    actual_type: JsonUtils.type_name(description),
                    expected_type: "string",
                }, { mode_index, mode_name }));
                description = "";
            }
        }

        //# Reporting and ignoring extra properties

        if (has_keys(mode_config_json)) {
            vsc_window.showWarningMessage(msg_unexpected_properties({
                properties: mode_config_json,
            }, { mode_index, mode_name }));
        }

        //# Reporting and ignoring duplicated modes

        let defined_mode_index = 0;
        for (const defined_mode_name of new_modes.keys()) {
            if (defined_mode_name !== mode_name) {
                ++defined_mode_index;
                continue;
            };

            vsc_window.showWarningMessage(msg_previously_defined({
                defined_mode_name,
                defined_mode_index,
            }, { mode_index, mode_name }));
            break;
        }

        const mode = new Mode(mode_name, capturing, description);
        new_modes.set(mode_name, mode);
    }

    if (new_modes.size !== modalcode_modes.length) {
        // parsing failed at some point, so we abort loading
        return undefined;
    }

    return new_modes;
}

for (const location of modes_locations) {
    let new_modes: Modes | undefined;
    switch (location) {
    case ModesLocation.Settings: {
        const modalcode_configuration = vsc_workspace.getConfiguration(configuration.modalcode.modes.KEY);
        const modalcode_modes_config: Json | undefined = modalcode_configuration.get(configuration.modalcode.modes.definitions.BASE);
        new_modes = parse_modes_from_settings(modalcode_modes_config);
    } break;
    case ModesLocation.GlobalStorage: {
        // TODO(stefano): create a file watcher
        new_modes = await parse_modes_from_globalStorage();
    } break;
    }

    if (new_modes === undefined) continue;
    set_modes(new_modes);
    return;
}

function parse_modes_locations(locations_json: Json | undefined): Set<ModesLocation> | undefined {
    if (locations_json === undefined) return undefined;
    else if (!JsonUtils.is_array(locations_json)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: configuration.modalcode.modes.locations.KEY,
            actual_type: JsonUtils.type_name(locations_json),
            expected_type: "array",
        }));
        return undefined;
    }

    const locations = new Set<ModesLocation>();
    for (const location_json of locations_json) {
        if (!JsonUtils.is_string(location_json)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: configuration.modalcode.modes.locations.Properties.LOCATION,
                actual_type: JsonUtils.type_name(location_json),
                expected_type: "string",
            }));
            continue;
        }

        // IDEA(stefano): can typescript return a value and a type assertion at the same time?
        const location = ModesLocation.LABELS[location_json as keyof typeof ModesLocation.LABELS] as ModesLocation | undefined;
        if (location === undefined) {
            const valid_actions = quote_and_join_items(Object.keys(ModesLocation.LABELS));
            vsc_window.showErrorMessage(`unrecognized settings change action '${location_json}', valid values are ${valid_actions}`);
            return undefined;
        }

        locations.add(location);
    }

    return locations;
}

function reload_modes_locations(): void {
    const modes_configuration = vsc_workspace.getConfiguration(configuration.modalcode.modes.KEY);
    const modes_locations_config: Json | undefined = modes_configuration.get(configuration.modalcode.modes.locations.BASE);
    const new_modes_locations = parse_modes_locations(modes_locations_config);
    if (new_modes_locations !== undefined) {
        // only updating the action kind if a valid value is selected
        modes_locations = new_modes_locations;
    }
}

if (event.affectsConfiguration(configuration.modalcode.modes.locations.KEY)) {
    switch (settings_change_action) {
    case SettingsChangeAction.AutomaticReload: {
        reload_modes_locations();
    } break;
    case SettingsChangeAction.AskToReload: {
        const initial_reload_action = await vsc_window.showInformationMessage(commands.modalcode.reload.MODES_LOCATIONS_CHANGE_TEXT, commands.modalcode.reload.MODES_PROMPT);
        switch (initial_reload_action) {
        case commands.modalcode.reload.MODES_PROMPT: {
            reload_modes_locations();
        } break;
        case undefined: {
            // abort reloading and keep the old modes
        } break;
        }
    } break;
    case SettingsChangeAction.NoAction: {
        // no action
    } break;
    }
}

type JsType = JsonType | "function" | "bigint" | "symbol";

function js_human_type_string(type_string: JsType): string {
    switch (type_string) {
    case "string":
    case "number":
    case "boolean":
    case "function":
    case "bigint":
    case "symbol": {
        return `a ${type_string}`;
    };
    case "null": {
        return type_string;
    };
    case "array":
    case "object": {
        return `an ${type_string}`;
    };
    }
}

function type_name(value: unknown): JsType {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value as JsType;
}
