// IDEA(stefano): provide option to sort quickpick items by definition order or by capturing/non-capturing
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
    Disposable,
    ExtensionContext,
    QuickPickItem,
    StatusBarItem,
} from "vscode";

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

function has_keys(obj: object): boolean {
    // eslint-disable-next-line no-unreachable-loop
    for (const _ in obj) return true;
    return false;
}

const MIN_NAME_LENGTH = 1;
const MAX_NAME_LENGTH = 16;

interface ModeConfigUnknown extends Readonly<Record<string, unknown>> {
    readonly name?: unknown;
    readonly capturing?: unknown;
}

interface ModeConfig {
    readonly name: string;
    readonly capturing: boolean;
}

interface Mode extends ModeConfig {
    readonly text: string;
}

function mode_at_index(mode_index: number): string {
    return `[mode at index ${mode_index}]`;
}

function mode_name_at_index(mode_index: number, mode_name: string): string {
    return `[mode ${mode_name} at index ${mode_index}]`;
}

const CAPTURING_MODE_DESCRIPTION = "Capturing";
const NON_CAPTURING_MODE_DESCRIPTION = "Non Capturing";

const MODE_CONTEXT_KEY = "modalcode.mode";

const SELECT_COMMAND = "modalcode.select";
const SELECT_COMMAND_TOOLTIP = "Select mode";
const SELECT_COMMAND_PLACEHOLDER = "Select mode to enter";

let modes: Map<string, Mode> | undefined;
let status_bar_item: StatusBarItem | undefined;
let type_subscription: Disposable | undefined;

export function activate(context: ExtensionContext): void {
    const modalcode_modes = vsc_workspace.getConfiguration("modalcode").get("modes");
    if (modalcode_modes === undefined) return;
    if (modalcode_modes === null) {
        vsc_window.showErrorMessage("'modalcode.modes' cannot be null");
        return;
    }
    if (!Array.isArray(modalcode_modes)) {
        vsc_window.showErrorMessage(`'modalcode.modes' must be an array but got '${typeof modalcode_modes}'`);
        return;
    }
    if (modalcode_modes.length === 0) return;

    // TODO(stefano): report errors for all modes and then terminate activation
    for (let mode_index = 0; mode_index < modalcode_modes.length; ++mode_index) {
        const mode_config = modalcode_modes[mode_index];

        if (mode_config === null) {
            vsc_window.showErrorMessage(`mode cannot be null ${mode_at_index(mode_index)}`);
            return;
        }
        if (typeof mode_config !== "object") {
            vsc_window.showErrorMessage(`mode must be an object but got '${typeof mode_config}' ${mode_at_index(mode_index)}`);
            return;
        }

        const { name, capturing, ...unexpected_properties } = mode_config as ModeConfigUnknown;

        if (name === undefined) {
            vsc_window.showErrorMessage(`missing 'name' property ${mode_at_index(mode_index)}`);
            return;
        }
        if (name === null) {
            vsc_window.showErrorMessage(`'name' cannot be null ${mode_at_index(mode_index)}`);
            return;
        }
        if (typeof name !== "string") {
            vsc_window.showErrorMessage(`'name' must be a string but got '${typeof name}' ${mode_at_index(mode_index)}`);
            return;
        }
        if (name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(`'name' cannot be shorter than ${MIN_NAME_LENGTH} characters ${mode_name_at_index(mode_index, name)}`);
            return;
        }
        if (name.length > MAX_NAME_LENGTH) {
            const trimmed_name = name.slice(0, MAX_NAME_LENGTH).concat("...");
            vsc_window.showErrorMessage(`'name' cannot be longer than ${MAX_NAME_LENGTH} characters ${mode_name_at_index(mode_index, trimmed_name)}`);
            return;
        }

        if (capturing === undefined) {
            vsc_window.showErrorMessage(`missing 'capturing' property ${mode_name_at_index(mode_index, name)}`);
            return;
        }
        if (capturing === null) {
            vsc_window.showErrorMessage(`'capturing' cannot be null ${mode_name_at_index(mode_index, name)}`);
            return;
        }
        if (typeof capturing !== "boolean") {
            vsc_window.showErrorMessage(`'capturing' must be a boolean but got '${typeof capturing}' ${mode_name_at_index(mode_index, name)}`);
            return;
        }

        if (has_keys(unexpected_properties)) {
            const unexptected_properties_array = Object.keys(unexpected_properties);
            const first_unexpected_property = unexptected_properties_array[0]!;
            let unexpected_properties_string = `'${first_unexpected_property}'`;
            for (let i = 1; i < unexptected_properties_array.length; ++i) {
                const property = unexptected_properties_array[i]!;
                unexpected_properties_string += `, '${property}'`;
            }

            vsc_window.showWarningMessage(`unexpected ${unexpected_properties_string} properties ${mode_name_at_index(mode_index, name)}`);
            return;
        }

        // IDEA(stefano): ignore mode instead of reporting an error
        for (let defined_mode_index = 0; defined_mode_index < mode_index; ++defined_mode_index) {
            const mode = modalcode_modes[defined_mode_index] as ModeConfig;
            if (mode.name !== name) continue;

            vsc_window.showErrorMessage(`previously defined at index ${defined_mode_index} ${mode_name_at_index(mode_index, name)}`);
            return;
        }
    }

    modes = new Map();

    const starting_mode = modalcode_modes[0] as ModeConfig;
    mode_from_config(starting_mode);
    modes.set(starting_mode.name, starting_mode);

    for (let mode_index = 1; mode_index < modalcode_modes.length; ++mode_index) {
        const mode = modalcode_modes[mode_index] as ModeConfig;
        mode_from_config(mode);
        modes.set(mode.name, mode);
    }

    // Note: ignoring non-capturing modes since type_subscription has not yet been set
    if (starting_mode.capturing) {
        mode_set_capturing(starting_mode);
    }
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, starting_mode.name);

    const ALIGN_LEFT = 9999999999;
    status_bar_item = vsc_window.createStatusBarItem(StatusBarAlignment.Left, ALIGN_LEFT);
    status_bar_item.command = SELECT_COMMAND;
    status_bar_item.tooltip = SELECT_COMMAND_TOOLTIP;
    status_bar_item.text = starting_mode.text;
    status_bar_item.show();

    const select_mode_command = vsc_commands.registerCommand(SELECT_COMMAND, select_mode);
    context.subscriptions.push(select_mode_command, status_bar_item);
}

export function deactivate(): void {
    mode_set_non_capturing();
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, null);
}

function ignore_type_commands(): void {
    // disabling the 'type' command
}

function mode_from_config(config: ModeConfig): asserts config is Mode {
    (config as typeof config & { text: string }).text = `-- ${config.name} --`;
}

function mode_set_capturing(mode: Mode): void {
    if (type_subscription !== undefined) return;
    try {
        type_subscription = vsc_commands.registerCommand("type", ignore_type_commands);
    } catch {
        vsc_window.showErrorMessage(`cannot enter mode '${mode.name}' because typing events are already being captured`);
    }
}

function mode_set_non_capturing(): void {
    if (type_subscription === undefined) return;
    type_subscription.dispose();
    type_subscription = undefined;
}

async function select_mode(name: unknown): Promise<void> {
    if (name === undefined) {
        // Note: rebuilding the quick pick items each time since this command is not expected to be
        // used often
        const quick_pick_items: QuickPickItem[] = [];
        for (const [_mode_name, mode] of modes!) {
            const description = mode.capturing ? CAPTURING_MODE_DESCRIPTION : NON_CAPTURING_MODE_DESCRIPTION;
            const quick_pick_item: QuickPickItem = { label: mode.name, description };
            quick_pick_items.push(quick_pick_item);
        }

        name = await vsc_window.showQuickPick(quick_pick_items, {
            canPickMany: false,
            title: SELECT_COMMAND_TOOLTIP,
            placeHolder: SELECT_COMMAND_PLACEHOLDER,
        });
        if (name === undefined) return;
    }
    else if (typeof name !== "string") {
        vsc_window.showErrorMessage(`mode name must be a 'string' but got '${typeof name}'`);
        return;
    }

    const mode = modes!.get(name as string);
    if (mode === undefined) {
        vsc_window.showErrorMessage(`mode '${name as string}' not found`);
        return;
    }

    if (mode.capturing) {
        mode_set_capturing(mode);
    }
    else {
        mode_set_non_capturing();
    }

    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, mode.name);
    status_bar_item!.text = mode.text;
}
