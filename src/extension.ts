// IDEA(stefano): provide option to sort quickpick items by definition order or by capturing/non-capturing
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

interface ModeConfig {
    readonly name: string;
    readonly capturing: boolean;
    readonly description: string | undefined;
}

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 16;

function mode_at_index(mode_index: number): string {
    return `[mode at index ${mode_index}]`;
}

function mode_name_at_index(mode_index: number, mode_name: string): string {
    return `[mode '${mode_name}' at index ${mode_index}]`;
}

function json_is_array(json: Json): json is Json[] {
    return Array.isArray(json);
}

function has_keys(obj: Record<string | number | symbol, unknown>): boolean {
    // eslint-disable-next-line no-unreachable-loop
    for (const _ in obj) return true;
    return false;
}

//# Extension logic definitions

const CAPTURING_MODE_DESCRIPTION = "Capturing";
const NON_CAPTURING_MODE_DESCRIPTION = "Non Capturing";

const MODE_CONTEXT_KEY = "modalcode.mode";

const SELECT_COMMAND = "modalcode.select";
const SELECT_COMMAND_TOOLTIP = "Select mode";
const SELECT_COMMAND_PLACEHOLDER = "Select mode to enter";

const STATUS_BAR_ITEM_ALIGN_LEFT = 9999999999;

type Modes = Map<string, Mode>;

let modes: Modes;
let status_bar_item: StatusBarItem;
let type_subscription: Disposable | undefined;

class Mode implements ModeConfig {
    public readonly name: string;
    public readonly capturing: boolean;
    public readonly text: string;
    public readonly description: string | undefined;

    public constructor(name: string, capturing: boolean, description: string | undefined) {
        this.name = name;
        this.capturing = capturing;
        this.text = `-- ${name} --`;
        this.description = description;
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
    const modalcode_modes: Json | undefined = vsc_workspace.getConfiguration("modalcode").get("modes");
    if (modalcode_modes === undefined) return;
    if (modalcode_modes === null) {
        vsc_window.showErrorMessage("'modalcode.modes' cannot be null");
        return;
    }
    if (!json_is_array(modalcode_modes)) {
        vsc_window.showErrorMessage(`'modalcode.modes' must be an array but got '${typeof modalcode_modes}'`);
        return;
    }

    modes = new Map<string, Mode>();

    validate_mode: for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index] as Json;

        if (mode_config === null) {
            vsc_window.showErrorMessage(`mode cannot be null ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (json_is_array(mode_config)) {
            vsc_window.showErrorMessage(`mode cannot be an array ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (typeof mode_config !== "object") {
            vsc_window.showErrorMessage(`mode must be an object but got '${typeof mode_config}' ${mode_at_index(mode_index)}`);
            continue;
        }

        const { name } = mode_config;
        if (name === undefined) {
            vsc_window.showErrorMessage(`missing 'name' property ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (name === null) {
            vsc_window.showErrorMessage(`'name' cannot be null ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (json_is_array(name)) {
            vsc_window.showErrorMessage(`'name' cannot be an array ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (typeof name !== "string") {
            vsc_window.showErrorMessage(`'name' must be a string but got '${typeof name}' ${mode_at_index(mode_index)}`);
            continue;
        }
        else if (name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(`'name' cannot be shorter than ${MIN_NAME_LENGTH} characters ${mode_name_at_index(mode_index, name)}`);
            continue;
        }
        else if (name.length > MAX_NAME_LENGTH) {
            const trimmed_name = name.slice(0, MAX_NAME_LENGTH).concat("...");
            vsc_window.showErrorMessage(`'name' cannot be longer than ${MAX_NAME_LENGTH} characters ${mode_name_at_index(mode_index, trimmed_name)}`);
            continue;
        }

        const { capturing } = mode_config;
        if (capturing === undefined) {
            vsc_window.showErrorMessage(`missing 'capturing' property ${mode_name_at_index(mode_index, name)}`);
            continue;
        }
        else if (capturing === null) {
            vsc_window.showErrorMessage(`'capturing' cannot be null ${mode_name_at_index(mode_index, name)}`);
            continue;
        }
        else if (json_is_array(capturing)) {
            vsc_window.showErrorMessage(`'capturing' cannot be an array ${mode_name_at_index(mode_index, name)}`);
            continue;
        }
        else if (typeof capturing !== "boolean") {
            vsc_window.showErrorMessage(`'capturing' must be a boolean but got '${typeof capturing}' ${mode_name_at_index(mode_index, name)}`);
            continue;
        }

        let { description } = mode_config;
        if (description === undefined) {
            // do nothing
        }
        else if (description === null) {
            description = undefined;
        }
        else if (json_is_array(description)) {
            vsc_window.showErrorMessage(`'description' cannot be an array ${mode_name_at_index(mode_index, name)}`);
            continue;
        }
        else if (typeof description !== "string") {
            vsc_window.showErrorMessage(`'description' must be a string but got '${typeof name}' ${mode_name_at_index(mode_index, name)}`);
            continue;
        }

        for (let defined_mode_index = 0; defined_mode_index < mode_index; ++defined_mode_index) {
            const mode = modalcode_modes[defined_mode_index] as unknown as ModeConfig;
            if (mode.name !== name) continue;

            vsc_window.showErrorMessage(`previously defined at index ${defined_mode_index} ${mode_name_at_index(mode_index, name)}`);
            continue validate_mode;
        }

        const mode = new Mode(name, capturing, description);
        modes.set(name, mode);

        const { name: _name, capturing: _capturing, description: _description, ...unexpected_properties } = mode_config;
        if (!has_keys(unexpected_properties)) continue;

        const [first_unexpected_property, ...other_unexptected_properties] = Object.keys(unexpected_properties);
        let unexpected_properties_string = `'${first_unexpected_property}'`;
        for (const unexpected_property of other_unexptected_properties) {
            unexpected_properties_string += `, '${unexpected_property}'`;
        }

        vsc_window.showWarningMessage(`unexpected ${unexpected_properties_string} properties ${mode_name_at_index(mode_index, name)}`);
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
        vsc_window.showErrorMessage(`mode name must be a 'string' but got an array`);
        return;
    }
    else if (typeof name !== "string") {
        vsc_window.showErrorMessage(`mode name must be a 'string' but got '${typeof name}'`);
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
