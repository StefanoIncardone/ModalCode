// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands

import * as vscode from "vscode";

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

interface ModeProperties {
    readonly name: string;
    readonly icon?: string;
    readonly capturing: boolean;
}

class Mode {
    public name: string;
    public text: string;

    constructor(name: string, icon: string | undefined) {
        this.name = name;
        if (icon !== undefined && icon.length > 0) {
            this.text = `-- $(${icon}) ${name} --`;
        } else {
            this.text = `-- ${name} --`;
        }
    }
}

const MAX_NAME_LENGTH = 16;

let modes_names: string[];
let modes: Mode[];
let non_capturing_modes_start_index: number;

let status_bar_item: vscode.StatusBarItem;
let type_subscription: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const modalcode_settings = vscode.workspace.getConfiguration("modalcode");

    const mode_properties_setting = modalcode_settings.get("modes");
    if (mode_properties_setting === null) {
        vscode.window.showInformationMessage("ModalCode: 'modalcode.modes' cannot be null");
        return;
    }
    if (!Array.isArray(mode_properties_setting)) {
        vscode.window.showErrorMessage(`ModalCode: invalid 'modalcode.modes' setting type, expected 'array' but got '${typeof mode_properties_setting}'`);
        return;
    }
    if (mode_properties_setting.length === 0) {
        vscode.window.showInformationMessage("ModalCode: no modes were defined");
        return;
    }

    non_capturing_modes_start_index = mode_properties_setting.length;
    for (let mode_properties_index = 0; mode_properties_index < mode_properties_setting.length; mode_properties_index += 1) {
        const mode_properties = mode_properties_setting[mode_properties_index];
        if (typeof mode_properties !== "object") {
            vscode.window.showErrorMessage(`ModalCode: invalid mode properties type, expected 'object' but got '${typeof mode_properties}'`);
            return;
        }
        if (mode_properties === null) {
            vscode.window.showErrorMessage("ModalCode: mode properties cannot be null");
            return;
        }

        if (!("name" in mode_properties)) {
            vscode.window.showErrorMessage("ModalCode: missing 'name' mode property");
            return;
        }
        if (mode_properties.name === null) {
            vscode.window.showErrorMessage("ModalCode: 'name' mode property cannot be null");
            return;
        }
        if (typeof mode_properties.name !== "string") {
            vscode.window.showErrorMessage(`ModalCode: invalid 'name' mode property, expected 'string' but got '${typeof mode_properties.name}'`);
            return;
        }
        if (mode_properties.name.length === 0) {
            vscode.window.showErrorMessage("ModalCode: 'name' mode property cannot be empty");
            return;
        }
        if (mode_properties.name.length > MAX_NAME_LENGTH) {
            vscode.window.showErrorMessage(`ModalColde: 'name' mode property cannot be longer than ${MAX_NAME_LENGTH} characters`);
            return;
        }
        // IDEA(stefano): add checks for leading/traling whitespace in `name`

        if (!("capturing" in mode_properties)) {
            vscode.window.showErrorMessage("ModalCode: missing 'capturing' mode property");
            return;
        }
        if (mode_properties.capturing === null) {
            vscode.window.showErrorMessage("ModalCode: 'capturing' mode property cannot be null");
            return;
        }
        if (typeof mode_properties.capturing !== "boolean") {
            vscode.window.showErrorMessage(`ModalCode: invalid 'capturing' mode property, expected 'boolean' but got '${typeof mode_properties.name}'`);
            return;
        }

        if ("icon" in mode_properties) {
            if (mode_properties.icon === null) {
                vscode.window.showErrorMessage("ModalCode: 'icon' mode property cannot be null");
                return;
            }
            if (typeof mode_properties.icon !== "string") {
                vscode.window.showErrorMessage(`ModalCode: invalid 'icon' mode property, expected 'string' but got '${typeof mode_properties.icon}'`);
                return;
            }

            // IDEA(stefano): add checks for invalid icon names, or remove icons entirely
        }

        type ModePropertiesExtra = ModeProperties & { [key: string]: unknown };
        const { name, icon, capturing, ...unexpected_properties } = mode_properties as ModePropertiesExtra;
        if (Object.keys(unexpected_properties).length > 0) {
            for (const unexpected_property in unexpected_properties) {
                vscode.window.showErrorMessage(`ModalCode: unexpected '${unexpected_property}' mode property for mode '${name}'`);
            }
            return;
        }

        for (let mode_index = 0; mode_index < mode_properties_index; mode_index += 1) {
            const defined_mode_name = (mode_properties_setting[mode_index] as ModeProperties).name;
            if (defined_mode_name === name) {
                vscode.window.showErrorMessage(`ModalCode: found duplicate mode '${defined_mode_name}'`);
                return;
            }
        }

        if (!capturing) {
            non_capturing_modes_start_index -= 1;
        }
    }

    if (non_capturing_modes_start_index === mode_properties_setting.length) {
        vscode.window.showErrorMessage("ModalCode: at least one non capturing mode needs to be defined");
        return;
    }

    modes = Array<Mode>(mode_properties_setting.length);
    let capturing_modes_start_index = 0;
    non_capturing_modes_start_index = modes.length;

    modes_names = Array<string>(modes.length);
    for (let mode_index = 0; mode_index < mode_properties_setting.length; mode_index += 1) {
        const { name, icon, capturing } = mode_properties_setting[mode_index] as ModeProperties;
        const mode = new Mode(name, icon);
        if (capturing) {
            modes[capturing_modes_start_index] = mode;
            capturing_modes_start_index += 1;
        } else {
            non_capturing_modes_start_index -= 1;
            modes[non_capturing_modes_start_index] = mode;
        }
        modes_names[mode_index] = name;
    }

    const select_mode_command = vscode.commands.registerCommand("modalcode.select_mode", select_mode);
    const enter_mode_command = vscode.commands.registerCommand("modalcode.enter_mode", enter_mode);

    status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999999999);
    status_bar_item.command = "modalcode.enter_mode";
    status_bar_item.tooltip = "Enter mode";

    const starting_mode = modes_names[0] as string;
    enter_mode(starting_mode);
    status_bar_item.show();

    context.subscriptions.push(select_mode_command, enter_mode_command, status_bar_item);
}

export function deactivate(): void {
    vscode.commands.executeCommand("setContext", "modalcode.mode", undefined);
    if (type_subscription !== undefined) {
        type_subscription.dispose();
        type_subscription = undefined;
    }
}

async function select_mode(): Promise<void> {
    const mode_name = await vscode.window.showQuickPick(modes_names, {
        canPickMany: false,
        title: "Enter mode",
        placeHolder: "Select mode to enter",
    });
    if (mode_name === undefined) {
        return;
    }

    enter_mode(mode_name);
}

function enter_mode(mode_name: string): void {
    let mode_index = 0;
    for (; mode_index < non_capturing_modes_start_index; mode_index += 1) {
        const mode = modes[mode_index] as Mode;
        if (mode.name !== mode_name) {
            continue;
        }

        if (type_subscription === undefined) {
            try {
                type_subscription = vscode.commands.registerCommand("type", () => {
                    // disabling the 'type' command
                });
            } catch {
                vscode.window.showErrorMessage(`ModalCode: cannot enter '${mode.name}' because the 'type' command is already registered`);
            }
        }

        status_bar_item.text = mode.text;
        vscode.commands.executeCommand("setContext", "modalcode.mode", mode.name);
        return;
    }

    for (; mode_index < modes.length; mode_index += 1) {
        const mode = modes[mode_index] as Mode;
        if (mode.name !== mode_name) {
            continue;
        }

        if (type_subscription !== undefined) {
            type_subscription.dispose();
            type_subscription = undefined;
        }

        status_bar_item.text = mode.text;
        vscode.commands.executeCommand("setContext", "modalcode.mode", mode.name);
        return;
    }

    vscode.window.showErrorMessage(`ModalCode: mode '${mode_name}' not found`);
}
