// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands
// IDEA(stefano): implement cursor alignment, to remove the "Cursor Align" extension
// IDEA(stefano): implement toggling of quote kinds, to remove the "Toggle Quotes"
// IDEA(stefano): implement command to generate a keybindings reset file
// IDEA(stefano): provide a "reference" keybindings extension

import * as vscode from "vscode";

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

class Mode {
    public name: string;
    public text: string;

    constructor(name: string) {
        this.name = name;
        this.text = `-- ${name} --`;
    }
}

const SELECT_MODE_COMMAND = "modalcode.select_mode";
const SELECT_MODE_TOOLTIP = "Select mode";
const SELECT_MODE_PLACEHOLDER = "Select mode to enter";
const ENTER_MODE_COMMAND = "modalcode.enter_mode";
const MODE_CONTEXT_KEY = "modalcode.mode";

let modes_names: string[];
let modes: Mode[];
let non_capturing_modes_start_index: number;

let status_bar_item: vscode.StatusBarItem;
let type_subscription: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
    interface ModeConfig {
        readonly name: string;
        readonly capturing: boolean;
    }

    interface ModeConfigExtra extends ModeConfig {
        readonly [key: string]: unknown
    };

    const modalcode_settings = vscode.workspace.getConfiguration("modalcode");

    const modes_config = modalcode_settings.get("modes");
    if (modes_config === undefined) {
        vscode.window.showInformationMessage("ModalCode: 'modalcode.modes' must be defined");
        return;
    }
    if (modes_config === null) {
        vscode.window.showInformationMessage("ModalCode: 'modalcode.modes' cannot be null");
        return;
    }
    if (!Array.isArray(modes_config)) {
        vscode.window.showErrorMessage(`ModalCode: invalid 'modalcode.modes' setting type, expected 'array' but got '${typeof modes_config}'`);
        return;
    }
    if (modes_config.length === 0) {
        vscode.window.showInformationMessage("ModalCode: no modes were defined");
        return;
    }

    const MIN_NAME_LENGTH = 1;
    const MAX_NAME_LENGTH = 16;

    non_capturing_modes_start_index = 0;
    for (let config_index = 0; config_index < modes_config.length; config_index += 1) {
        const mode_config = modes_config[config_index];

        if (typeof mode_config !== "object") {
            vscode.window.showErrorMessage(`ModalCode: invalid mode properties type, expected 'object' but got '${typeof mode_config}'`);
            return;
        }
        if (mode_config === null) {
            vscode.window.showErrorMessage("ModalCode: mode properties cannot be null");
            return;
        }

        if (!("name" in mode_config)) {
            vscode.window.showErrorMessage("ModalCode: missing 'name' mode property");
            return;
        }
        if (mode_config.name === null) {
            vscode.window.showErrorMessage("ModalCode: 'name' mode property cannot be null");
            return;
        }
        if (typeof mode_config.name !== "string") {
            vscode.window.showErrorMessage(`ModalCode: 'name' mode property must be a 'string' but got '${typeof mode_config.name}'`);
            return;
        }
        if (mode_config.name.length < MIN_NAME_LENGTH) {
            vscode.window.showErrorMessage(`ModalCode: 'name' mode property cannot be shorter than ${MIN_NAME_LENGTH} characters`);
            return;
        }
        if (mode_config.name.length > MAX_NAME_LENGTH) {
            vscode.window.showErrorMessage(`ModalColde: 'name' mode property cannot be longer than ${MAX_NAME_LENGTH} characters`);
            return;
        }

        if (!("capturing" in mode_config)) {
            vscode.window.showErrorMessage("ModalCode: missing 'capturing' mode property");
            return;
        }
        if (mode_config.capturing === null) {
            vscode.window.showErrorMessage("ModalCode: 'capturing' mode property cannot be null");
            return;
        }
        if (typeof mode_config.capturing !== "boolean") {
            vscode.window.showErrorMessage(`ModalCode: invalid 'capturing' mode property, expected 'boolean' but got '${typeof mode_config.name}'`);
            return;
        }

        const { name, capturing, ...unexpected_properties } = mode_config as ModeConfigExtra;
        if (Object.keys(unexpected_properties).length > 0) {
            for (const unexpected_property in unexpected_properties) {
                vscode.window.showErrorMessage(`ModalCode: unexpected '${unexpected_property}' mode property for mode '${name}'`);
            }
            return;
        }

        for (let mode_index = 0; mode_index < config_index; mode_index += 1) {
            const defined_mode_name = (modes_config[mode_index] as ModeConfig).name;
            if (defined_mode_name === name) {
                vscode.window.showErrorMessage(`ModalCode: found duplicate mode '${defined_mode_name}'`);
                return;
            }
        }

        if (!capturing) {
            non_capturing_modes_start_index += 1;
        }
    }

    if (non_capturing_modes_start_index === 0) {
        vscode.window.showErrorMessage("ModalCode: at least one non capturing mode needs to be defined");
        return;
    }

    modes = Array(modes_config.length) as Mode[];
    let capturing_modes_start_index = 0;
    non_capturing_modes_start_index = modes.length;

    modes_names = Array(modes.length) as string[];
    for (let mode_index = 0; mode_index < modes_config.length; mode_index += 1) {
        const { name, capturing } = modes_config[mode_index] as ModeConfig;
        const mode = new Mode(name);
        if (capturing) {
            modes[capturing_modes_start_index] = mode;
            capturing_modes_start_index += 1;
        } else {
            non_capturing_modes_start_index -= 1;
            modes[non_capturing_modes_start_index] = mode;
        }
        modes_names[mode_index] = name;
    }

    const select_mode_command = vscode.commands.registerCommand(SELECT_MODE_COMMAND, select_mode);
    const enter_mode_command = vscode.commands.registerCommand(ENTER_MODE_COMMAND, enter_mode);

    status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999999999);
    status_bar_item.command = SELECT_MODE_COMMAND;
    status_bar_item.tooltip = SELECT_MODE_TOOLTIP;

    const starting_mode = modes_names[0] as string;
    set_mode(starting_mode);
    status_bar_item.show();

    context.subscriptions.push(select_mode_command, enter_mode_command, status_bar_item);
}

export function deactivate(): void {
    vscode.commands.executeCommand("setContext", MODE_CONTEXT_KEY, undefined);
    if (type_subscription !== undefined) {
        type_subscription.dispose();
        type_subscription = undefined;
    }
}

async function select_mode(): Promise<void> {
    const mode_name = await vscode.window.showQuickPick(modes_names, {
        canPickMany: false,
        title: SELECT_MODE_TOOLTIP,
        placeHolder: SELECT_MODE_PLACEHOLDER,
    });
    if (mode_name === undefined) {
        return;
    }

    set_mode(mode_name);
}

function enter_mode(name: unknown): void {
    if (name === undefined) {
        vscode.window.showErrorMessage("ModalCode: missing name argument");
        return;
    }
    if (typeof name !== "string") {
        vscode.window.showErrorMessage("ModalCode: name must be a string");
        return;
    }

    set_mode(name);
}

function set_mode(name: string): void {
    let mode: Mode;
    search_mode: {
        let mode_index = 0;
        for (; mode_index < non_capturing_modes_start_index; mode_index += 1) {
            mode = modes[mode_index] as Mode;
            if (mode.name !== name) {
                continue;
            }

            if (type_subscription === undefined) {
                try {
                    type_subscription = vscode.commands.registerCommand("type", () => {
                        // disabling the 'type' command
                    });
                } catch {
                    vscode.window.showErrorMessage(`ModalCode: cannot enter '${mode.name}' because the 'type' command is already registered`);
                    return;
                }
            }

            break search_mode;
        }

        for (; mode_index < modes.length; mode_index += 1) {
            mode = modes[mode_index] as Mode;
            if (mode.name !== name) {
                continue;
            }

            if (type_subscription !== undefined) {
                type_subscription.dispose();
                type_subscription = undefined;
            }

            break search_mode;
        }

        vscode.window.showErrorMessage(`ModalCode: mode '${name}' not found`);
        return;
    }

    status_bar_item.text = mode.text;
    vscode.commands.executeCommand("setContext", MODE_CONTEXT_KEY, mode.name);
}
