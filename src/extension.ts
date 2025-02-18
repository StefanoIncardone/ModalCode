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

const MAX_NAME_LENGTH = 16;

let mode_names: string[];
let mode_texts: string[];
let mode_capturings: boolean[];
let status_bar_item: vscode.StatusBarItem;
let type_subscription: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const modalcode_settings = vscode.workspace.getConfiguration("modalcode");

    const mode_properties_setting = modalcode_settings.get("modes");
    if (mode_properties_setting === undefined) {
        vscode.window.showInformationMessage("ModalCode: no modes were defined");
        return;
    }
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

    let found_non_capturing_mode = false;
    const defined_mode_names: string[] = [];
    const defined_mode_texts: string[] = [];
    const defined_mode_capturings: boolean[] = [];
    for (const mode_properties of mode_properties_setting) {
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
                vscode.window.showErrorMessage(`ModalCode: unexpected '${unexpected_property}' mode property`);
            }
            return;
        }

        for (const defined_mode_name of defined_mode_names) {
            if (defined_mode_name === name) {
                vscode.window.showErrorMessage(`ModalCode: found duplicate mode '${defined_mode_name}'`);
                return;
            }
        }

        const text = icon !== undefined ? `-- $(${icon}) ${name} --` : `-- ${name} --`;
        if (!capturing) {
            found_non_capturing_mode = true;
        }

        defined_mode_names.push(name);
        defined_mode_texts.push(text);
        defined_mode_capturings.push(capturing);
    }

    if (!found_non_capturing_mode) {
        vscode.window.showErrorMessage("ModalCode: at least one non capturing mode needs to be defined");
        return;
    }

    const starting_mode_setting = modalcode_settings.get("starting_mode");
    let starting_mode: string;
    starting_mode_selection: if (starting_mode_setting === undefined) {
        // Safety: we previously checked for at least one mode present
        starting_mode = defined_mode_names[0] as string;
    } else {
        if (starting_mode_setting === null) {
            vscode.window.showErrorMessage("ModalCode: 'modalcode.starting_mode' property cannot be null");
            return;
        }
        if (typeof starting_mode_setting !== "string") {
            vscode.window.showErrorMessage(`ModalCode: invalid 'modalcode.starting_mode' setting type, expected 'string' but got '${typeof starting_mode_setting}'`);
            return;
        }
        if (starting_mode_setting.length === 0) {
            vscode.window.showErrorMessage("ModalCode: 'modalcode.starting_mode' cannot be empty");
            return;
        }
        if (starting_mode_setting.length > MAX_NAME_LENGTH) {
            vscode.window.showErrorMessage(`ModalColde: 'modalcode.starting_mode' cannot be longer than ${MAX_NAME_LENGTH} characters`);
            return;
        }
        // IDEA(stefano): add checks for leading/traling whitespace in `name`

        for (const starting_mode_name of defined_mode_names) {
            if (starting_mode_name === starting_mode_setting) {
                starting_mode = starting_mode_name;
                break starting_mode_selection;
            }
        }
        // Safety: we previously checked for at least one mode present
        starting_mode = defined_mode_names[0] as string;
        vscode.window.showInformationMessage(`ModalCode: starting mode '${starting_mode_setting}' not found, entering '${starting_mode}' instead`);
    }

    mode_names = defined_mode_names;
    mode_texts = defined_mode_texts;
    mode_capturings = defined_mode_capturings;

    const enter_mode_command = vscode.commands.registerCommand("modalcode.enter_mode", enter_mode);

    status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999999999);
    status_bar_item.command = "modalcode.enter_mode";
    status_bar_item.tooltip = "Enter mode";
    enter_mode(starting_mode);
    status_bar_item.show();

    context.subscriptions.push(enter_mode_command, status_bar_item);
}

export function deactivate(): void {
    vscode.commands.executeCommand("setContext", "modalcode.mode", undefined);
    if (type_subscription !== undefined) {
        type_subscription.dispose();
        type_subscription = undefined;
    }
}

async function enter_mode(mode_name: string | undefined): Promise<void> {
    if (mode_name === undefined) {
        const selected_mode = await vscode.window.showQuickPick(mode_names, {
            canPickMany: false,
            title: "Enter mode",
            placeHolder: "Select mode to enter",
        });
        if (selected_mode === undefined) {
            return;
        }
        mode_name = selected_mode;
    }

    for (const [mode_index, name] of mode_names.entries()) {
        if (name !== mode_name) {
            continue;
        }

        if (mode_capturings[mode_index] as boolean) {
            if (type_subscription === undefined) {
                try {
                    type_subscription = vscode.commands.registerCommand("type", () => {
                        // disabling the 'type' command
                    });
                } catch {
                    vscode.window.showErrorMessage("ModalCode: the 'type' command is already registered");
                }
            }
        } else {
            if (type_subscription !== undefined) {
                type_subscription.dispose();
                type_subscription = undefined;
            }
        }

        status_bar_item.text = mode_texts[mode_index] as string;
        vscode.commands.executeCommand("setContext", "modalcode.mode", name);
        return;
    }
    vscode.window.showErrorMessage(`ModalCode: mode '${mode_name}' not found`);
    return;
}
