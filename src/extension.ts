// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands
// IDEA(stefano): implement cursor alignment, to remove the "Cursor Align" extension
// IDEA(stefano): implement toggling of quote kinds, to remove the "Toggle Quotes"
// IDEA(stefano): implement command to generate a keybindings reset file
// IDEA(stefano): provide a "reference" keybindings extension
// TODO(stefano): provide a command to reload the settings

import {
    StatusBarAlignment,
    commands as vsc_commands,
    window as vsc_window,
    workspace as vsc_workspace,
} from "vscode";
import type {
    Disposable,
    ExtensionContext,
    QuickPickItem,
    StatusBarItem,
} from "vscode";

//# Validation definitions

type JsonPrimitive = string | number | boolean | null;
type JsonArray = Json[];
type JsonObject = { [key: string]: Json; };
type Json = JsonPrimitive | JsonArray | JsonObject;

type JsonTypeString = "string" | "number" | "boolean" | "null" | "array" | "object";

// eslint-disable-next-line @typescript-eslint/consistent-return
function json_human_type_string(type_string: JsonTypeString): string {
    switch (type_string) {
    case "string":
    case "number":
    case "boolean":
        return `a ${type_string}`;
    case "null":
        return type_string;
    case "array":
    case "object":
        return `an ${type_string}`;
    }
}

const NAME = "name";
const CAPTURING = "capturing";
const DESCRIPTION = "description";

const NAME_Q = `'${NAME}'`;
const CAPTURING_Q = `'${CAPTURING}'`;
const DESCRIPTION_Q = `'${DESCRIPTION}'`;

interface ModeConfig {
    readonly [NAME]: string;
    readonly [CAPTURING]: boolean;
    readonly [DESCRIPTION]: string | undefined;
}

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 16;

function json_is_array(json: Json): json is Json[] {
    return Array.isArray(json);
}

function has_keys(obj: Record<string | number | symbol, unknown>): boolean {
    // eslint-disable-next-line no-unreachable-loop
    for (const _ in obj) return true;
    return false;
}

//## Notifications messages

interface ErrorLocation {
    mode_index: number;
}

interface ErrorLocationWithName extends ErrorLocation {
    mode_name?: string;
}

function message_location({ mode_index, mode_name }: ErrorLocationWithName): string {
    if (mode_name === undefined) {
        return `[mode at index ${mode_index}]`;
    }
    return `[mode '${mode_name}' at index ${mode_index}]`;
}

function message(msg: string, location?: ErrorLocationWithName): string {
    if (location === undefined) {
        return msg;
    }
    return `${msg} ${message_location(location)}`;
}

function msg_mismatched_type(
    property_name: string,
    actual_type: JsonTypeString,
    expected_type: JsonTypeString,
    location?: ErrorLocationWithName,
): string {
    const actual_type_human_string = json_human_type_string(actual_type);
    const expected_type_human_string = json_human_type_string(expected_type);
    const msg = `${property_name} must be ${expected_type_human_string} but got ${actual_type_human_string}`;
    return message(msg, location);
}

function msg_missing_property(
    property_name: string,
    location?: ErrorLocationWithName,
): string {
    const msg = `missing ${property_name} property`;
    return message(msg, location);
}

function msg_cannot_be_null(
    property_name: string,
    location?: ErrorLocationWithName,
): string {
    const msg = `${property_name} cannot be null`;
    return message(msg, location);
}

function msg_cannot_be_an_array(
    property_name: string,
    location?: ErrorLocationWithName,
): string {
    const msg = `${property_name} cannot be an array`;
    return message(msg, location);
}

function msg_min_length(
    property_name: string,
    min: number,
    location?: ErrorLocationWithName,
): string {
    const msg = `${property_name} cannot be shorter than ${min} characters`;
    return message(msg, location);
}

function msg_max_length(
    property_name: string,
    max: number,
    location?: ErrorLocation,
): string {
    const trimmed_name = property_name.slice(0, max).concat("...");
    const msg = `${property_name} cannot be longer than ${max} characters`;
    if (location === undefined) return msg;
    return message(msg, { mode_name: trimmed_name, ...location });
}

function msg_unexpected_properties(
    properties: JsonObject,
    location?: ErrorLocationWithName,
): string {
    const [first_unexpected_property, ...other_unexptected_properties] = Object.keys(properties);
    let unexpected_properties_string = `'${first_unexpected_property}'`;
    for (const unexpected_property of other_unexptected_properties) {
        unexpected_properties_string += `, '${unexpected_property}'`;
    }

    const msg = `unexpected ${unexpected_properties_string} properties`;
    return message(msg, location);
}

function msg_previously_defined(
    defined_mode_index: number,
    location?: ErrorLocationWithName,
): string {
    const msg = `previously defined at index ${defined_mode_index}`;
    return message(msg, location);
}

//# Extension logic definitions

const CAPTURING_MODE_DESCRIPTION = "Capturing";
const NON_CAPTURING_MODE_DESCRIPTION = "Non Capturing";

const MODALCODE = "modalcode";
const MODES = "modes";
const MODE = "mode";

const MODALCODE_Q = `'${MODALCODE}'`;
const MODES_Q = `'${MODES}'`;
const MODE_Q = `'${MODE}'`;

const MODES_SETTINGS_KEY = `${MODALCODE}.${MODES}`;
const MODE_CONTEXT_KEY = `${MODALCODE}.${MODE}`;

const MODES_SETTINGS_KEY_Q = `'${MODES_SETTINGS_KEY}'`;
const MODE_CONTEXT_KEY_Q = `'${MODE_CONTEXT_KEY}'`;

const SELECT_COMMAND = `${MODALCODE}.select`;
const SELECT_COMMAND_TOOLTIP = "Select mode";
const SELECT_COMMAND_PLACEHOLDER = "Select mode to enter";

const STATUS_BAR_ITEM_ALIGN_LEFT = 9999999999;

type Modes = Map<string, Mode>;

let modes: Modes;
let status_bar_item: StatusBarItem;
let type_subscription: Disposable | undefined;

class Mode implements ModeConfig {
    public readonly [NAME]: string;
    public readonly [CAPTURING]: boolean;
    public readonly [DESCRIPTION]: string | undefined;
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
                    vsc_window.showErrorMessage(`cannot enter mode '${this.name}' because typing events are already being captured`);
                    return;
                }
            }
        }
        else {
            reset_type_subscription();
        }
        set_context_key(this.name);
        status_bar_item.text = this.text;
    }
}

export function activate(context: ExtensionContext): void {
    const modalcode_modes: Json | undefined = vsc_workspace.getConfiguration(MODALCODE).get(MODES);
    if (modalcode_modes === undefined) return;
    if (modalcode_modes === null) {
        vsc_window.showErrorMessage(msg_cannot_be_null(MODES_SETTINGS_KEY_Q));
        return;
    }
    if (!json_is_array(modalcode_modes)) {
        vsc_window.showErrorMessage(msg_mismatched_type(MODES_SETTINGS_KEY_Q, "array", typeof modalcode_modes as JsonTypeString));
        return;
    }

    modes = new Map<string, Mode>();

    for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index] as Json;

        if (mode_config === null) {
            vsc_window.showErrorMessage(msg_cannot_be_null(MODE, { mode_index }));
            continue;
        }
        else if (json_is_array(mode_config)) {
            vsc_window.showErrorMessage(msg_cannot_be_an_array(MODE, { mode_index }));
            continue;
        }
        else if (typeof mode_config !== "object") {
            vsc_window.showErrorMessage(msg_mismatched_type(MODE, "object", typeof mode_config as JsonTypeString, { mode_index }));
            continue;
        }

        const mode_name = mode_config[NAME];
        if (mode_name === undefined) {
            vsc_window.showErrorMessage(msg_missing_property(NAME_Q, { mode_index }));
            continue;
        }
        else if (mode_name === null) {
            vsc_window.showErrorMessage(msg_cannot_be_null(NAME_Q, { mode_index }));
            continue;
        }
        else if (json_is_array(mode_name)) {
            vsc_window.showErrorMessage(msg_cannot_be_an_array(NAME_Q, { mode_index }));
            continue;
        }
        else if (typeof mode_name !== "string") {
            vsc_window.showErrorMessage(msg_mismatched_type(NAME_Q, "string", typeof mode_name as JsonTypeString, { mode_index }));
            continue;
        }
        else if (mode_name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_min_length(NAME_Q, MIN_NAME_LENGTH, { mode_index, mode_name }));
            continue;
        }
        else if (mode_name.length > MAX_NAME_LENGTH) {
            vsc_window.showErrorMessage(msg_max_length(NAME_Q, MAX_NAME_LENGTH, { mode_index }));
            continue;
        }

        const capturing = mode_config[CAPTURING];
        if (capturing === undefined) {
            vsc_window.showErrorMessage(msg_missing_property(CAPTURING_Q, { mode_index, mode_name }));
            continue;
        }
        else if (capturing === null) {
            vsc_window.showErrorMessage(msg_cannot_be_null(CAPTURING_Q, { mode_index, mode_name }));
            continue;
        }
        else if (json_is_array(capturing)) {
            vsc_window.showErrorMessage(msg_cannot_be_an_array(CAPTURING_Q, { mode_index, mode_name }));
            continue;
        }
        else if (typeof capturing !== "boolean") {
            vsc_window.showErrorMessage(msg_mismatched_type(CAPTURING_Q, "boolean", typeof capturing as JsonTypeString, { mode_index, mode_name }));
            continue;
        }

        let description = mode_config[DESCRIPTION];
        if (description === undefined) {
            // do nothing
        }
        else if (description === null) {
            description = undefined;
        }
        else if (json_is_array(description)) {
            vsc_window.showErrorMessage(msg_cannot_be_an_array(DESCRIPTION_Q, { mode_index, mode_name }));
            continue;
        }
        else if (typeof description !== "string") {
            vsc_window.showErrorMessage(msg_mismatched_type(DESCRIPTION_Q, "string", typeof mode_name as JsonTypeString, { mode_index, mode_name }));
            continue;
        }

        const { [NAME]: _name, [CAPTURING]: _capturing, [DESCRIPTION]: _description, ...unexpected_properties } = mode_config;
        if (has_keys(unexpected_properties)) {
            vsc_window.showWarningMessage(msg_unexpected_properties(unexpected_properties, { mode_index, mode_name }));
        }

        for (let defined_mode_index = 0; defined_mode_index < mode_index; ++defined_mode_index) {
            const defined_mode = modalcode_modes[defined_mode_index] as unknown as ModeConfig;
            if (defined_mode.name !== mode_name) continue;

            vsc_window.showWarningMessage(msg_previously_defined(defined_mode_index, { mode_index, mode_name }));
            continue;
        }

        const mode = new Mode(mode_name, capturing, description);
        modes.set(mode_name, mode);
    }

    const starting_mode = modes.values().next().value;
    if (starting_mode === undefined) return;

    status_bar_item = vsc_window.createStatusBarItem(StatusBarAlignment.Left, STATUS_BAR_ITEM_ALIGN_LEFT);
    starting_mode.set();

    status_bar_item.command = SELECT_COMMAND;
    status_bar_item.tooltip = SELECT_COMMAND_TOOLTIP;
    status_bar_item.show();

    const select_mode_command = vsc_commands.registerCommand(SELECT_COMMAND, select_mode);
    context.subscriptions.push(select_mode_command, status_bar_item);
}

export function deactivate(): void {
    reset_type_subscription();
    set_context_key(undefined);
}

function ignore_type_commands(): void { /* disabling the 'type' command */ }

function set_context_key(mode_name: string | undefined): void {
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, mode_name);
}

function reset_type_subscription(): void {
    if (type_subscription === undefined) return;
    type_subscription.dispose();
    type_subscription = undefined;
}

async function select_mode(name?: Json): Promise<void> {
    if (name === undefined || name === null) {
        // Note: rebuilding the quick pick items each time since this command is not expected to be
        // used often
        const quick_pick_items: QuickPickItem[] = [];
        for (const [_mode_name, mode] of modes!) {
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
    else if (json_is_array(name)) {
        vsc_window.showErrorMessage(msg_mismatched_type("mode name", "string", "array"));
        return;
    }
    else if (typeof name !== "string") {
        vsc_window.showErrorMessage(msg_mismatched_type("mode name", "string", typeof name as JsonTypeString));
        return;
    }

    const mode = modes.get(name);
    if (mode === undefined) {
        vsc_window.showErrorMessage(`mode '${name}' not found`);
        return;
    }
    if (mode.text === status_bar_item.text) return;

    mode.set();
}
