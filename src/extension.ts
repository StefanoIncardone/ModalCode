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
import type { Json, JsonObject, JsonType } from "./json.js";

//# utility functions

type Quote = "\"" | "'" | "`";
type Separator = ",";

const QUOTE = "'" satisfies Quote;
const SEPARATOR = "," satisfies Separator;

function quote_and_join_items(values: string[], quote: Quote = QUOTE, separator: Separator = SEPARATOR): string {
    const [first_value, ...other_values] = values;
    if (first_value === undefined) return "";

    let quoted_values = `${quote}${first_value}${quote}`;
    for (const other_value of other_values) {
        quoted_values += `${separator} ${quote}${other_value}${quote}`;
    }
    return quoted_values;
}

function has_keys(obj: Record<string | number | symbol, unknown>): boolean {
    // eslint-disable-next-line no-unreachable-loop
    for (const _ in obj) return true;
    return false;
}

//# Validation definitions

interface ModeConfig {
    readonly name: string;
    readonly capturing: boolean;
    readonly description: string | undefined;
}

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 16;
const MIN_DESCRIPTION_LENGTH = 1;

//## Notifications messages

interface ErrorLocation {
    mode_index: number;
    mode_name?: string | undefined;
}

function message_with_location(msg: string, { mode_name, mode_index }: ErrorLocation): string {
    if (mode_name === undefined) return `${msg} [mode at index ${mode_index}]`;
                                 return `${msg} [mode '${mode_name}' at index ${mode_index}]`;
}

function message(msg: string, location?: ErrorLocation): string {
    if (location === undefined) return msg;
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

// TODO(stefano): represent enums
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
const CAPTURING_DESCRIPTION = "Capturing";
const NON_CAPTURING_DESCRIPTION = "Non Capturing";

namespace configuration {
    export namespace modalcode {
        export const BASE = "modalcode";
        export const KEY = BASE;

        export namespace settingsChangeAction {
            export const BASE = "settingsChangeAction";
            export const KEY = `${modalcode.KEY}.${BASE}`;

            export namespace Properties {
                export const ACTION = "action";
            }
        }

        export namespace modes {
            export const BASE = "modes";
            export const KEY = `${modalcode.KEY}.${BASE}`;

            export namespace definitions {
                export const BASE = "definitions";
                export const KEY = `${modes.KEY}.${BASE}`;

                export namespace Properties {
                    export const MODE = "mode";

                    export const NAME = "name";
                    export const CAPTURING = "capturing";
                    export const DESCRIPTION = "description";
                }
            }

            // export namespace locations {
            //     export const BASE = "locations";
            //     export const KEY = `${modes.KEY}.${BASE}`;

            //     export namespace Properties {
            //         export const LOCATION = "location";
            //     }
            // }
        }
    }
}

namespace commands {
    export namespace modalcode {
        export const BASE = configuration.modalcode.BASE;
        export const KEY = configuration.modalcode.KEY;

        export namespace select {
            export const BASE = "select";
            export const KEY = `${modalcode.KEY}.${BASE}`;

            export const TOOLTIP = "Select mode";
            export const PLACEHOLDER = "Select mode to enter";
        }

        export namespace reload {
            export const BASE = "reload";
            export const KEY = `${modalcode.KEY}.${BASE}`;

            export const MODES_CHANGE_TEXT = "Mode definitions have changed";
            export const MODES_PROMPT = "Reload modes";

            export const MODES_LOCATIONS_CHANGE_TEXT = "Modes locations have changed";
            export const MODES_LOCATIONS_PROMPT = "Reload modes locations";

            export const FAILED_TEXT = "Failed loading modes";
        }
    }
}

namespace keybindings {
    export namespace modalcode {
        export const BASE = configuration.modalcode.BASE;
        export const KEY = configuration.modalcode.KEY;

        export namespace mode {
            export const BASE = "mode";
            export const KEY = `${modalcode.KEY}.${BASE}`;
        }
    }
}

const STATUS_BAR_ITEM_ALIGN_LEFT = 9999999999;


enum SettingsChangeAction {
    AutomaticReload = 0,
    AskToReload     = 1,
    NoAction        = 2,
}

namespace SettingsChangeAction {
    export const COUNT = SettingsChangeAction.NoAction + 1;
    export const DEFAULT = SettingsChangeAction.AutomaticReload;

    export const LABELS = {
        "automatic reload": SettingsChangeAction.AutomaticReload,
        "ask to reload": SettingsChangeAction.AskToReload,
        "no action": SettingsChangeAction.NoAction,
    } as const satisfies Record<string, SettingsChangeAction>;
}

type Modes = Map<string, Mode>;

let settings_change_action: SettingsChangeAction = SettingsChangeAction.DEFAULT;
let modes: Modes = new Map<string, Mode>();
let status_bar_item: StatusBarItem | undefined;
let type_subscription: Disposable | undefined;

class Mode implements ModeConfig {
    public readonly name: string;
    public readonly capturing: boolean;
    public readonly description: string;
    public readonly text: string;

    public constructor(name: string, capturing: boolean, description: string) {
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
    vsc_commands.executeCommand("setContext", keybindings.modalcode.mode.KEY, mode_name);
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
                description: mode.capturing ? CAPTURING_DESCRIPTION : NON_CAPTURING_DESCRIPTION,
                detail: mode.description,
            };
            quick_pick_items.push(quick_pick_item);
        }

        const selected_item = await vsc_window.showQuickPick(quick_pick_items, {
            canPickMany: false,
            title: commands.modalcode.select.TOOLTIP,
            placeHolder: commands.modalcode.select.PLACEHOLDER,
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
    if (action === undefined) return undefined;
    else if (!JsonUtils.is_string(action)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: configuration.modalcode.settingsChangeAction.KEY,
            actual_type: JsonUtils.type_name(action),
            expected_type: "string",
        }));
        return undefined;
    }

    // IDEA(stefano): can typescript return a value and a type assertion at the same time?
    const action_kind = SettingsChangeAction.LABELS[action as keyof typeof SettingsChangeAction.LABELS] as SettingsChangeAction | undefined;
    if (action_kind === undefined) {
        const valid_actions = quote_and_join_items(Object.keys(SettingsChangeAction.LABELS));
        vsc_window.showErrorMessage(`unrecognized settings change action '${action}', valid values are ${valid_actions}`);
        return undefined;
    }
    return action_kind;
}

function reload_settings_change_action(): void {
    const settings_change_action_configuration = vsc_workspace.getConfiguration(configuration.modalcode.KEY);
    const settings_change_action_config: Json | undefined = settings_change_action_configuration.get(configuration.modalcode.settingsChangeAction.BASE);
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
        status_bar_item.command = commands.modalcode.select.KEY;
        status_bar_item.tooltip = commands.modalcode.select.TOOLTIP;

        starting_mode.set();
        status_bar_item.show();
    }
    else {
        starting_mode.set();
    }
}

function parse_modes_from_settings(modalcode_modes: Json | undefined): Modes | undefined {
    const new_modes: Modes = new Map();

    //# Validating the config object

    if (modalcode_modes === undefined) return new_modes;
    else if (!JsonUtils.is_array(modalcode_modes)) {
        vsc_window.showErrorMessage(msg_mismatched_type({
            property_name: `'${configuration.modalcode.modes.KEY}'`,
            actual_type: JsonUtils.type_name(modalcode_modes),
            expected_type: "array",
        }));
        return undefined;
    }

    for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index]!;

        //# Validating the mode config object

        if (!JsonUtils.is_object(mode_config)) {
            vsc_window.showErrorMessage(msg_mismatched_type({
                property_name: configuration.modalcode.modes.definitions.Properties.MODE,
                actual_type: JsonUtils.type_name(mode_config),
                expected_type: "object",
            }, { mode_index }));
            continue;
        }

        //# Validating required properties

        const { name: mode_name } = mode_config;
        delete mode_config["name"];

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

        const { capturing } = mode_config;
        delete mode_config["capturing"];

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

        let { description } = mode_config;
        if (description === undefined) {
            description = "";
        }
        else if (description !== undefined) {
            delete mode_config["description"];

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

        if (has_keys(mode_config)) {
            vsc_window.showWarningMessage(msg_unexpected_properties({
                properties: mode_config,
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

async function reload_modes(): Promise<void> {
    for (;;) {
        const modalcode_configuration = vsc_workspace.getConfiguration(configuration.modalcode.KEY);
        const modalcode_modes_config: Json | undefined = modalcode_configuration.get(configuration.modalcode.modes.BASE);
        const new_modes = parse_modes_from_settings(modalcode_modes_config);
        if (new_modes !== undefined) {
            set_modes(new_modes);
            return;
        }

        // eslint-disable-next-line no-await-in-loop
        const failed_loading_action = await vsc_window.showErrorMessage(commands.modalcode.reload.FAILED_TEXT, commands.modalcode.reload.MODES_PROMPT);
        switch (failed_loading_action) {
        case commands.modalcode.reload.MODES_PROMPT: {
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
    if (event.affectsConfiguration(configuration.modalcode.settingsChangeAction.KEY)) {
        reload_settings_change_action();
    }

    if (event.affectsConfiguration(configuration.modalcode.modes.KEY)) {
        switch (settings_change_action) {
        case SettingsChangeAction.AutomaticReload: {
            await reload_modes();
        } break;
        case SettingsChangeAction.AskToReload: {
            const initial_reload_action = await vsc_window.showInformationMessage(commands.modalcode.reload.MODES_CHANGE_TEXT, commands.modalcode.reload.MODES_LOCATIONS_PROMPT);
            switch (initial_reload_action) {
            case commands.modalcode.reload.MODES_LOCATIONS_PROMPT: {
                await reload_modes();
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
}

export async function activate(context: ExtensionContext): Promise<void> {
    reload_settings_change_action();
    await reload_modes();

    context.subscriptions.push(
        vsc_commands.registerCommand(commands.modalcode.select.KEY, select_mode),
        vsc_commands.registerCommand(commands.modalcode.reload.KEY, reload_modes),
        vsc_workspace.onDidChangeConfiguration(reload_configs),
    );
}

export function deactivate(): void {
    reset_status_bar_item();
    reset_type_subscription();
    set_context_key(undefined);
}
