// IDEA(stefano): provide option to sort quickpick items by definition order or by capturing/non-capturing
    // IDEA(stefano): make 'select_command_mode_names' into QuickPickItem[]
// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands
// IDEA(stefano): implement cursor alignment, to remove the "Cursor Align" extension
// IDEA(stefano): implement toggling of quote kinds, to remove the "Toggle Quotes"
// IDEA(stefano): implement command to generate a keybindings reset file
// IDEA(stefano): provide a "reference" keybindings extension

import {
    Disposable,
    ExtensionContext,
    StatusBarAlignment,
    StatusBarItem,
    window as vsc_window,
    workspace as vsc_workspace,
    commands as vsc_commands,
    QuickPickOptions,
} from "vscode";

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

function has_keys(obj: object) {
    for (const _ in obj) return true;
    return false;
}

class Mode {
    public name: string;
    public text: string;

    constructor(name: string) {
        this.name = name;
        this.text = `-- ${name} --`;
    }
}

const MODE_CONTEXT_KEY = "modalcode.mode";
const SELECT_COMMAND = "modalcode.select";
const SELECT_COMMAND_TOOLTIP = "Select mode";
const SELECT_COMMAND_PLACEHOLDER = "Select mode to enter";
/** In order of definition in settings.json */
let select_command_modes_names: string[];
let select_command_options: QuickPickOptions;

/** Ordered by capturing/non-capturing */
let modes: Mode[];
let non_capturing_modes_start_index: number;

let status_bar_item: StatusBarItem;
let type_subscription: Disposable | undefined;

export function activate(context: ExtensionContext): void {
    interface ModeConfigUnknown {
        readonly name?: unknown;
        readonly capturing?: unknown;
        readonly [key: string]: unknown;
    }

    interface ModeConfig {
        readonly name: string;
        readonly capturing: boolean;
    }

    const modes_config = vsc_workspace.getConfiguration("modalcode").get("modes");
    if (modes_config === undefined) return;
    if (modes_config === null) {
        vsc_window.showErrorMessage("ModalCode: 'modalcode.modes' cannot be null");
        return;
    }
    if (!Array.isArray(modes_config)) {
        vsc_window.showErrorMessage(`ModalCode: 'modalcode.modes' must be an 'array' but got '${typeof modes_config}'`);
        return;
    }
    if (modes_config.length === 0) return;

    const MIN_NAME_LENGTH = 1;
    const MAX_NAME_LENGTH = 16;
    non_capturing_modes_start_index = 0;

    // IDEA(stefano): report errors for all modes and then terminate activation
    for (let mode_index = 0; mode_index < modes_config.length; ++mode_index) {
        const mode_config = modes_config[mode_index];

        if (typeof mode_config !== "object") {
            vsc_window.showErrorMessage(`ModalCode: mode must be an 'object' but got '${typeof mode_config}' [mode at index ${mode_index}]`);
            return;
        }
        if (mode_config === null) {
            vsc_window.showErrorMessage(`ModalCode: mode cannot be null [mode at index ${mode_index}]`);
            return;
        }

        const { name, capturing, ...unexpected_properties } = mode_config as ModeConfigUnknown;

        if (name === undefined) {
            vsc_window.showErrorMessage(`ModalCode: missing 'name' property [mode at index ${mode_index}]`);
            return;
        }
        if (name === null) {
            vsc_window.showErrorMessage(`ModalCode: 'name' cannot be null [mode at index ${mode_index}]`);
            return;
        }
        if (typeof name !== "string") {
            vsc_window.showErrorMessage(`ModalCode: 'name' must be a 'string' but got '${typeof name}' [mode at index ${mode_index}]`);
            return;
        }
        if (name.length < MIN_NAME_LENGTH) {
            vsc_window.showErrorMessage(`ModalCode: 'name' cannot be shorter than ${MIN_NAME_LENGTH} characters [mode '${name}' at index ${mode_index}]`);
            return;
        }
        if (name.length > MAX_NAME_LENGTH) {
            vsc_window.showErrorMessage(`ModalCode: 'name' cannot be longer than ${MAX_NAME_LENGTH} characters [mode '${name}' at index ${mode_index}]`);
            return;
        }

        if (capturing === undefined) {
            vsc_window.showErrorMessage(`ModalCode: missing 'capturing' property [mode '${name}' at index ${mode_index}]`);
            return;
        }
        if (capturing === null) {
            vsc_window.showErrorMessage(`ModalCode: 'capturing' cannot be null [mode '${name}' at index ${mode_index}]`);
            return;
        }
        if (typeof capturing !== "boolean") {
            vsc_window.showErrorMessage(`ModalCode: 'capturing' must be a 'boolean' but got '${typeof capturing}' [mode '${name}' at index ${mode_index}]`);
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

            vsc_window.showWarningMessage(`ModalCode: unexpected ${unexpected_properties_string} properties [mode '${name}' at index ${mode_index}]`);
            return;
        }

        // IDEA(stefano): ignore mode instead of reporting an error
        for (let defined_mode_index = 0; defined_mode_index < mode_index; ++defined_mode_index) {
            const mode = modes_config[defined_mode_index] as ModeConfig;
            if (mode.name !== name) continue;

            vsc_window.showErrorMessage(`ModalCode: previously defined at index ${defined_mode_index} [mode '${name}' at index ${mode_index}]`);
            return;
        }

        if (capturing) {
            ++non_capturing_modes_start_index;
        }
    }

    modes = Array<Mode>(modes_config.length);
    select_command_modes_names = Array<string>(modes.length);

    let capturing_modes_end_index = 0;
    for (let mode_index = 0; mode_index < modes_config.length; ++mode_index) {
        const mode_config = modes_config[mode_index] as ModeConfig;
        const mode = new Mode(mode_config.name);

        select_command_modes_names[mode_index] = mode.name;
        if (mode_config.capturing) {
            modes[capturing_modes_end_index++] = mode;
        }
        else {
            modes[non_capturing_modes_start_index++] = mode;
        }
    }
    non_capturing_modes_start_index = capturing_modes_end_index;

    status_bar_item = vsc_window.createStatusBarItem(StatusBarAlignment.Left, 9999999999);
    status_bar_item.command = SELECT_COMMAND;
    status_bar_item.tooltip = SELECT_COMMAND_TOOLTIP;
    status_bar_item.show();

    const select_mode_command = vsc_commands.registerCommand(SELECT_COMMAND, select_mode);
    context.subscriptions.push(select_mode_command, status_bar_item);

    select_command_options = {
        canPickMany: false,
        title: SELECT_COMMAND_TOOLTIP,
        placeHolder: SELECT_COMMAND_PLACEHOLDER,
    };

    const starting_mode_config = modes_config[0] as ModeConfig;
    const starting_mode = new Mode(starting_mode_config.name);
    // Note: ignoring non-capturing modes since type_subscription has not yet been set
    if (starting_mode_config.capturing) {
        enter_capturing_mode(starting_mode);
    }
}

export function deactivate(): void {
    set_non_capturing_mode();
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, undefined);
}

function set_context(mode: Mode): void {
    vsc_commands.executeCommand("setContext", MODE_CONTEXT_KEY, mode.name);
    status_bar_item.text = mode.text;
}

function disable_type_command(): void {
    // disabling the 'type' command
}

function set_capturing_mode(mode: Mode): void {
    if (type_subscription !== undefined) return;
    try {
        type_subscription = vsc_commands.registerCommand("type", disable_type_command);
    } catch {
        vsc_window.showErrorMessage(`ModalCode: cannot enter '${mode.name}' because the 'type' command is already registered`);
    }
}

function enter_capturing_mode(mode: Mode): void {
    set_capturing_mode(mode);
    set_context(mode);
}

function set_non_capturing_mode(): void {
    if (type_subscription === undefined) return;
    type_subscription.dispose();
    type_subscription = undefined;
}

function enter_non_capturing_mode(mode: Mode): void {
    set_non_capturing_mode();
    set_context(mode);
}

/** This function exists just to satisfy the type checker */
function set_mode(name: string): void {
    let mode_index = 0;

    // searching through capturing modes
    for (; mode_index < non_capturing_modes_start_index; ++mode_index) {
        const mode = modes[mode_index]!;
        if (mode.name !== name) continue;
        enter_capturing_mode(mode);
        return;
    }

    // searching through non-capturing modes
    for (; mode_index < modes.length; ++mode_index) {
        const mode = modes[mode_index]!;
        if (mode.name !== name) continue;
        enter_non_capturing_mode(mode);
        return;
    }

    vsc_window.showErrorMessage(`ModalCode: mode '${name}' not found`);
}

async function select_mode(name: unknown): Promise<void> {
    if (name === undefined) {
        name = await vsc_window.showQuickPick(select_command_modes_names, select_command_options);
        if (name === undefined) return;
    }
    else if (typeof name !== "string") {
        vsc_window.showErrorMessage("ModalCode: name must be a string");
        return;
    }
    set_mode(name as string);
}
