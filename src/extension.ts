// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands
// IDEA(stefano): implement cursor alignment, to remove the "Cursor Align" extension
// IDEA(stefano): implement toggling of quote kinds, to remove the "Toggle Quotes"
// IDEA(stefano): implement command to generate a keybindings reset file
// IDEA(stefano): provide a "reference" keybindings extension

import {
    StatusBarAlignment,
    commands as vsc_commands,
    window as vsc_window,
    workspace as vsc_workspace,
} from "vscode";
import type {
    ConfigurationChangeEvent,
    Disposable,
    ExtensionContext,
    QuickPickItem,
    StatusBarItem,
} from "vscode";
import * as JsonUtils from "./json.js";
import type { Json, JsonArray, JsonObject, JsonPrimitive, JsonType } from "./json.js";

//# utility functions

function quote_and_join_items(values: string[]): string {
    const [first_value, ...other_values] = values;
    if (first_value === undefined) return "";

    let quoted_values = `'${first_value}'`;
    for (const other_value of other_values) {
        quoted_values += `, '${other_value}'`;
    }
    return quoted_values;
}

function has_keys(obj: Record<string | number | symbol, unknown>): boolean {
    // eslint-disable-next-line no-unreachable-loop
    for (const _ in obj) return true;
    return false;
}

//# Validation definitions

const NAME = "name";
const CAPTURING = "capturing";
const DESCRIPTION = "description";

const NAME_Q = `'${NAME}'`;
const CAPTURING_Q = `'${CAPTURING}'`;
const DESCRIPTION_Q = `'${DESCRIPTION}'`;

type ModeConfigJson = JsonPrimitive | JsonArray | {
    name?: Json;
    capturing?: Json;
    description?: Json;

    [key: string]: Json;
};

interface ModeConfig {
    readonly name: string;
    readonly capturing: boolean;
    readonly description: string | undefined;
}

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 16;

//## Notifications messages

interface ErrorLocation {
    mode_index: number;
    mode_name?: string | undefined;
}

function message_with_location(msg: string, location: ErrorLocation): string {
    if (location.mode_name === undefined) {
        return `${msg} [mode at index ${location.mode_index}]`;
    }
    return `${msg} [mode '${location.mode_name}' at index ${location.mode_index}]`;
}

function message(msg: string, location?: ErrorLocation): string {
    if (location === undefined) {
        return msg;
    }
    return message_with_location(msg, location);
}

interface PropertyError {
    property_name: string;
}

interface MissingPropertyError extends PropertyError {
}

function msg_missing_property(
    { property_name }: MissingPropertyError,
    location?: ErrorLocation,
): string {
    const msg = `missing ${property_name} property`;
    return message(msg, location);
}

function json_human_type_string(type_string: JsonType): string {
    switch (type_string) {
    case "string":
    case "number":
    case "boolean": {
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

interface MismatchedTypeError extends PropertyError {
    actual_type: JsonType;
    expected_type: JsonType;
}

function msg_mismatched_type(
    { property_name, actual_type, expected_type }: MismatchedTypeError,
    location?: ErrorLocation,
): string {
    const actual_type_human_string = json_human_type_string(actual_type);
    const expected_type_human_string = json_human_type_string(expected_type);
    const msg = `${property_name} must be ${expected_type_human_string} but got ${actual_type_human_string}`;
    return message(msg, location);
}

interface MinLengthError extends PropertyError {
    min: number;
}

function msg_min_length(
    { property_name, min }: MinLengthError,
    location?: ErrorLocation,
): string {
    const msg = `${property_name} cannot be shorter than ${min} characters`;
    return message(msg, location);
}

interface MaxLengthError extends PropertyError {
    max: number;
}

function msg_max_length(
    { property_name, max }: MaxLengthError,
    location?: ErrorLocation,
): string {
    const trimmed_name = property_name.slice(0, max).concat("...");
    const msg = `${property_name} cannot be longer than ${max} characters`;
    if (location === undefined) return msg;
    return message_with_location(msg, { mode_name: trimmed_name, ...location });
}

interface UnexpectedPropertiesError {
    properties: JsonObject;
}

function msg_unexpected_properties(
    { properties }: UnexpectedPropertiesError,
    location?: ErrorLocation,
): string {
    const unexpected_properties_string = quote_and_join_items(Object.keys(properties));
    const msg = `unexpected ${unexpected_properties_string} properties`;
    return message(msg, location);
}

interface ModePreviouslyDefinedError {
    defined_mode_name: string;
    defined_mode_index: number;
}

function msg_previously_defined(
    { defined_mode_name, defined_mode_index }: ModePreviouslyDefinedError,
    location?: ErrorLocation,
): string {
    const msg = `mode '${defined_mode_name}' previously defined at index ${defined_mode_index}`;
    return message(msg, location);
}

//# Extension logic definitions

const CAPTURING_MODE_DESCRIPTION = "Capturing";
const NON_CAPTURING_MODE_DESCRIPTION = "Non Capturing";

const MODALCODE = "modalcode";
const MODES = "modes";
const SETTINGS_CHANGE_ACTION = "settingsChangeAction";
const MODE = "mode";

// const MODALCODE_Q = `'${MODALCODE}'`;
// const MODES_Q = `'${MODES}'`;
// const MODE_Q = `'${MODE}'`;

const MODES_SETTINGS_KEY = `${MODALCODE}.${MODES}`;
const MODES_SETTINGS_KEY_Q = `'${MODES_SETTINGS_KEY}'`;

const SETTINGS_CHANGE_ACTION_SETTINGS_KEY = `${MODALCODE}.${SETTINGS_CHANGE_ACTION}`;
// const SETTINGS_CHANGE_ACTION_SETTINGS_KEY_Q = `'${SETTINGS_CHANGE_ACTION_SETTINGS_KEY}'`;
const MODE_CONTEXT_KEY = `${MODALCODE}.${MODE}`;

// const MODE_CONTEXT_KEY_Q = `'${MODE_CONTEXT_KEY}'`;

const SELECT_COMMAND = `${MODALCODE}.select`;
const SELECT_COMMAND_TOOLTIP = "Select mode";
const SELECT_COMMAND_PLACEHOLDER = "Select mode to enter";

const RELOAD_COMMAND = `${MODALCODE}.reload`;

const RELOAD_NOTIFICATION_TEXT = "Configuration changed";
const FAILED_LOADING_TEXT = "Failed loading modes";
const RELOAD_MODES_TEXT = "Reload modes";

const STATUS_BAR_ITEM_ALIGN_LEFT = 9999999999;

const SettingsChangeAction_AUTOMATIC_RELOAD = 0; // eslint-disable-line @typescript-eslint/naming-convention
const SettingsChangeAction_ASK_TO_RELOAD    = 1; // eslint-disable-line @typescript-eslint/naming-convention
const SettingsChangeAction_NO_ACTION        = 2; // eslint-disable-line @typescript-eslint/naming-convention
const SettingsChangeAction_DEFAULT = SettingsChangeAction_AUTOMATIC_RELOAD; // eslint-disable-line @typescript-eslint/naming-convention
// const SettingsChangeAction_Count = SettingsChangeAction_NO_ACTION + 1;
type SettingsChangeAction = (
    typeof SettingsChangeAction_AUTOMATIC_RELOAD |
    typeof SettingsChangeAction_ASK_TO_RELOAD |
    typeof SettingsChangeAction_NO_ACTION
);

const SETTINGS_CHANGE_ACTION_LABELS: Record<string, SettingsChangeAction> = {
    "automatic reload": SettingsChangeAction_AUTOMATIC_RELOAD,
    "ask to reload": SettingsChangeAction_ASK_TO_RELOAD,
    "no action": SettingsChangeAction_NO_ACTION,
} as const;

type Modes = Map<string, Mode>;

let settings_change_action: SettingsChangeAction = SettingsChangeAction_DEFAULT;
let modes: Modes = new Map<string, Mode>();
let status_bar_item: StatusBarItem | undefined;
let type_subscription: Disposable | undefined;

class Mode implements ModeConfig {
    public readonly name: string;
    public readonly capturing: boolean;
    public readonly description: string | undefined;
    public readonly text: string;

    public constructor(name: string, capturing: boolean, description: string | undefined) {
        this.name = name;
        this.capturing = capturing;
        this.description = description;
        this.text = `-- ${name} --`;
    }

    public set(): void {
        if (this.capturing) {
            if (type_subscription === undefined) {
                try {
                    type_subscription = vsc_commands.registerCommand("type", ignore_type_commands);
                } catch {
                    vsc_window.showErrorMessage(`cannot enter '${this.name}' mode because typing events are already being captured`);
                    return;
                }
            }
        }
        else {
            reset_type_subscription();
        }

        status_bar_item!.text = this.text;
        set_context_key(this.name);
    }
}

function ignore_type_commands(): void { /* disabling the 'type' command */ }

function set_context_key(mode_name: string | undefined): void {
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, mode_name);
}

function reset_status_bar_item(): void {
    if (status_bar_item === undefined) return;
    status_bar_item.dispose();
    status_bar_item = undefined;
}

function reset_type_subscription(): void {
    if (type_subscription === undefined) return;
    type_subscription.dispose();
    type_subscription = undefined;
}

async function select_mode(name?: Json): Promise<void> {
    if (modes.size === 0) return;

    if (name === undefined || name === null) {
        // Note: rebuilding the quick pick items each time since this command is not expected to be
        // used often
        const quick_pick_items: QuickPickItem[] = [];
        for (const [_mode_name, mode] of modes) {
            const quick_pick_item: QuickPickItem = {
                label: mode.name,
                description: mode.capturing ? CAPTURING_MODE_DESCRIPTION : NON_CAPTURING_MODE_DESCRIPTION,
            };
            if (mode.description !== undefined) {
                quick_pick_item.detail = mode.description;
            }
            quick_pick_items.push(quick_pick_item);
        }

        const selected_item = await vsc_window.showQuickPick(quick_pick_items, {
            canPickMany: false,
            title: SELECT_COMMAND_TOOLTIP,
            placeHolder: SELECT_COMMAND_PLACEHOLDER,
        });
        if (selected_item === undefined) return;

        name = selected_item.label;
    }
    else if (!JsonUtils.is_string(name)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: "mode name",
            actual_type: JsonUtils.type_name(name),
            expected_type: "string",
        }));
        return;
    }

    const mode = modes.get(name);
    if (mode === undefined) {
        vsc_window.showErrorMessage(`mode '${name}' not found`);
        return;
    }
    if (mode.text === status_bar_item!.text) return;

    mode.set();
}

function parse_settings_change_action(action: Json | undefined): SettingsChangeAction | undefined {
    if (action === undefined) {
        return undefined;
    }
    else if (!JsonUtils.is_string(action)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: MODE,
            actual_type: JsonUtils.type_name(action),
            expected_type: "string",
        }));
        return undefined;
    }

    const action_kind = SETTINGS_CHANGE_ACTION_LABELS[action];
    if (action_kind === undefined) {
        const valid_actions = quote_and_join_items(Object.keys(SETTINGS_CHANGE_ACTION_LABELS));
        vsc_window.showErrorMessage(`unrecognized settings change action '${action}', valid values are ${valid_actions}`);
        return undefined;
    }
    return action_kind;
}

function parse_modes(modalcode_modes: Json | undefined): Modes | undefined {
    const new_modes: Modes = new Map();

    //# Validating the config object

    if (modalcode_modes === undefined) return new_modes;
    else if (!JsonUtils.is_array(modalcode_modes)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: MODES_SETTINGS_KEY_Q,
            actual_type: JsonUtils.type_name(modalcode_modes),
            expected_type: "array",
        }));
        return undefined;
    }

    for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index] as ModeConfigJson;

        //# Validating the mode config object

        if (!JsonUtils.is_object(mode_config)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: MODE,
                actual_type: JsonUtils.type_name(mode_config),
                expected_type: "object",
            }, { mode_index }));
            continue;
        }

        //# Validating required properties

        const { name: mode_name } = mode_config;
        delete mode_config.name;

        if (mode_name === undefined) {
            vsc_window.showErrorMessage(msg_missing_property({
                property_name: NAME_Q,
            }, { mode_index }));
            continue;
        }
        else if (!JsonUtils.is_string(mode_name)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: NAME_Q,
                actual_type: JsonUtils.type_name(mode_name),
                expected_type: "string",
            }, { mode_index }));
            continue;
        }
        else if (mode_name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_min_length({
                property_name: NAME_Q,
                min: MIN_NAME_LENGTH,
            }, { mode_index, mode_name }));
            continue;
        }
        else if (mode_name.length > MAX_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_max_length({
                property_name: NAME_Q,
                max: MAX_NAME_LENGTH,
            }, { mode_index }));
            continue;
        }

        const { capturing } = mode_config;
        delete mode_config.capturing;

        if (capturing === undefined) {
            vsc_window.showErrorMessage(msg_missing_property({
                property_name: CAPTURING_Q,
            }, { mode_index, mode_name }));
            continue;
        }
        else if (!JsonUtils.is_boolean(capturing)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: CAPTURING_Q,
                actual_type: JsonUtils.type_name(capturing),
                expected_type: "boolean",
            }, { mode_index, mode_name }));
            continue;
        }

        //# Validating optional properties

        let { description } = mode_config;
        if (description !== undefined) {
            delete mode_config.description;

            if (!JsonUtils.is_string(description)) {
                vsc_window.showErrorMessage(msg_mismatched_type({
                    property_name: DESCRIPTION_Q,
                    actual_type: JsonUtils.type_name(description),
                    expected_type: "string",
                }, { mode_index, mode_name }));
                description = undefined;
            }
            else if (description.length === 0) {
                // treating empty descriptions as no descriptions
                description = undefined;
            }
        }

        //# Reporting and ignoring extra properties

        if (has_keys(mode_config)) {
            vsc_window.showWarningMessage(msg_unexpected_properties({
                properties: mode_config,
            }, { mode_index, mode_name }));
        }

        //# Reporting and ignoring duplicated modes

        let defined_mode_index = 0;
        for (const [defined_mode_name, _] of new_modes) {
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

function reload_settings_change_action(): void {
    const settings_change_action_config: Json | undefined = vsc_workspace.getConfiguration(MODALCODE).get(SETTINGS_CHANGE_ACTION);
    const new_settings_change_action = parse_settings_change_action(settings_change_action_config);
    if (new_settings_change_action !== undefined) {
        // only updating the action kind if a valid value is selected
        settings_change_action = new_settings_change_action;
    }
}

function set_modes(new_modes: Modes): void {
    modes = new_modes;

    const starting_mode = modes.values().next().value;
    if (starting_mode === undefined) {
        // no modes were defined
        deactivate();
        return;
    }

    if (status_bar_item === undefined) {
        status_bar_item = vsc_window.createStatusBarItem(StatusBarAlignment.Left, STATUS_BAR_ITEM_ALIGN_LEFT);
        status_bar_item.command = SELECT_COMMAND;
        status_bar_item.tooltip = SELECT_COMMAND_TOOLTIP;

        starting_mode.set();
        status_bar_item.show();
    }
    else {
        starting_mode.set();
    }
}

async function reload_modes(): Promise<void> {
    for (;;) {
        const modalcode_modes_config: Json | undefined = vsc_workspace.getConfiguration(MODALCODE).get(MODES);
        const new_modes = parse_modes(modalcode_modes_config);
        if (new_modes !== undefined) {
            set_modes(new_modes);
            return;
        }

        // eslint-disable-next-line no-await-in-loop
        const failed_loading_action = await vsc_window.showErrorMessage(FAILED_LOADING_TEXT, RELOAD_MODES_TEXT);
        switch (failed_loading_action) {
        case RELOAD_MODES_TEXT: {
            // try reloading modes again
            continue;
        }
        case undefined: {
            // abort reloading and keep the old modes
            return;
        }
        }
    }
}

async function reload_configs(event: ConfigurationChangeEvent): Promise<void> {
    if (event.affectsConfiguration(SETTINGS_CHANGE_ACTION_SETTINGS_KEY)) {
        reload_settings_change_action();
    }

    if (event.affectsConfiguration(MODES_SETTINGS_KEY)) {
        switch (settings_change_action) {
        case SettingsChangeAction_AUTOMATIC_RELOAD: {
            await reload_modes();
        } break;
        case SettingsChangeAction_ASK_TO_RELOAD: {
            const initial_reload_action = await vsc_window.showInformationMessage(RELOAD_NOTIFICATION_TEXT, RELOAD_MODES_TEXT);
            switch (initial_reload_action) {
            case RELOAD_MODES_TEXT: {
                await reload_modes();
            } break;
            case undefined: {
                // abort reloading and keep the old modes
            } break;
            }
        } break;
        case SettingsChangeAction_NO_ACTION: {
            // no action
        } break;
        }
    }
}

export async function activate(context: ExtensionContext): Promise<void> {
    reload_settings_change_action();
    await reload_modes();

    const select_mode_command = vsc_commands.registerCommand(SELECT_COMMAND, select_mode);
    const reload_modes_command = vsc_commands.registerCommand(RELOAD_COMMAND, reload_modes);
    const on_settings_change = vsc_workspace.onDidChangeConfiguration(reload_configs);
    context.subscriptions.push(
        select_mode_command,
        reload_modes_command,
        on_settings_change,
    );
}

export function deactivate(): void {
    reset_status_bar_item();
    reset_type_subscription();

    set_context_key(undefined);
}
