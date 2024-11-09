// IDEA(stefano): implement multiple copy/paste buffers
// IDEA(stefano): implement visual line mode commands

import * as vscode from 'vscode';

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

let modes: Modes;
let type_subscription: vscode.Disposable | undefined;
let status_bar_item: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
    // modes settings definitions
    const modalcode_settings = vscode.workspace.getConfiguration("modalcode");

    const mode_properties_setting = modalcode_settings.get("modes");
    if (mode_properties_setting === undefined) {
        vscode.window.showInformationMessage("ModalCode: no modes were defined");
        return;
    }
    if (mode_properties_setting === null) {
        vscode.window.showInformationMessage(`ModalCode: 'modalcode.mode' cannot be null`);
        return;
    }
    if (!Array.isArray(mode_properties_setting)) {
        vscode.window.showErrorMessage(
            `ModalCode: invalid 'modalcode.mode' setting type, expected 'array' but got '${typeof mode_properties_setting}'`);
        return;
    }
    if (mode_properties_setting.length === 0) {
        vscode.window.showInformationMessage("ModalCode: no modes were defined");
        return;
    }

    const defined_modes = new Modes([], [], []);
    for (const mode_properties of mode_properties_setting) {
        if (typeof mode_properties !== "object") {
            vscode.window.showErrorMessage(
                `ModalCode: invalid mode properties type, expected 'object' but got '${typeof mode_properties}'`
            );
            return;
        }
        if (mode_properties === null) {
            vscode.window.showErrorMessage(`ModalCode: mode properties cannot be null`);
            return;
        }

        if (!("name" in mode_properties)) {
            vscode.window.showErrorMessage(`ModalCode: missing 'name' mode property`);
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
        const max_name_length = 16;
        if (mode_properties.name.length > max_name_length) {
            vscode.window.showErrorMessage(`ModalColde: 'name' mode property cannot be longer than ${max_name_length} characters`);
            return;
        }
        // IDEA(stefano): add checks for leading/traling whitespace in `name`

        if (!("capturing" in mode_properties)) {
            vscode.window.showErrorMessage(`ModalCode: missing 'capturing' mode property`);
            return;
        }
        if (typeof mode_properties.capturing !== "boolean") {
            vscode.window.showErrorMessage(`ModalCode: invalid 'capturing' mode property, expected 'boolean' but got '${typeof mode_properties.name}'`);
            return;
        }

        if ("icon" in mode_properties) {
            if (typeof mode_properties.icon !== "string") {
                vscode.window.showErrorMessage(`ModalCode: invalid 'icon' mode property, expected 'string' but got '${typeof mode_properties.icon}'`);
                return;
            }

            // IDEA(stefano): add checks for invalid icon names, or remove icons entirely
        }

        type ModePropertiesExtra = ModeProperties & { [key: string]: unknown };
        const {name, icon, capturing, ...unexpected_properties} = mode_properties as ModePropertiesExtra;
        if (Object.keys(unexpected_properties).length > 0) {
            for (const unexpected_property in unexpected_properties) {
                vscode.window.showErrorMessage(`ModalCode: unexpected '${unexpected_property}' mode property`);
            }
            return;
        }

        for (const defined_mode_name of defined_modes.names) {
            if (defined_mode_name === name) {
                vscode.window.showErrorMessage(`ModalCode: found duplicate mode '${defined_mode_name}'`);
                return;
            }
        }

        let text: string;
        if (icon !== undefined) {
            text = `-- $(${icon}) ${name} --`;
        } else {
            text = `-- ${name} --`;
        }

        defined_modes.names.push(name);
        defined_modes.texts.push(text);
        defined_modes.capturing.push(capturing);
    }

    let at_least_one_non_capturing_mode = false;
    for (const capturing of defined_modes.capturing) {
        if (!capturing) {
            at_least_one_non_capturing_mode = true;
            break;
        }
    }
    if (!at_least_one_non_capturing_mode) {
        vscode.window.showErrorMessage(
            "ModalCode: at least one non capturing mode needs to be defined");
        return;
    }

    const starting_mode_setting = modalcode_settings.get("starting_mode");
    let starting_mode: Mode;
    if (starting_mode_setting === undefined) {
        starting_mode = 0;
    } else {
        if (typeof starting_mode_setting !== "string") {
            vscode.window.showErrorMessage(
                `ModalCode: invalid 'modalcode.starting_mode' setting type, expected 'string' but got '${typeof starting_mode_setting}'`);
            return;
        }

        let starting_mode_from_defined_modes: Mode | undefined;
        for (const [mode_index, starting_mode_name] of defined_modes.names.entries()) {
            if (starting_mode_name === starting_mode_setting) {
                starting_mode_from_defined_modes = mode_index;
                break;
            }
        }
        if (starting_mode_from_defined_modes === undefined) {
            vscode.window.showErrorMessage(`ModalCode: starting mode '${starting_mode_setting}' not found`);
            return;
        }
        starting_mode = starting_mode_from_defined_modes;
    }

    modes = defined_modes;

    const enter_mode_command = vscode.commands.registerCommand("modalcode.enter_mode", enter_mode);
    context.subscriptions.push(enter_mode_command);

    // change mode command
    const change_mode_command = vscode.commands.registerCommand("modalcode.change_mode", change_mode_user_command);
    context.subscriptions.push(change_mode_command);

    // status bar item
    status_bar_item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9999999999);
    change_mode(starting_mode);
    status_bar_item.command = "modalcode.change_mode";
    status_bar_item.tooltip = "Change mode";
    status_bar_item.show();
    context.subscriptions.push(status_bar_item);

    vscode.window.showInformationMessage("ModalCode: activated succesfully");
}

export function deactivate(): void {
    vscode.commands.executeCommand("setContext", "modalcode.mode", undefined);
    if (type_subscription !== undefined) {
        type_subscription.dispose();
        type_subscription = undefined;
    }
}

function change_mode(mode: Mode): void {
    // Note: this function is only called internally, hence removing undefined from indexes is safe
    const name = modes.names[mode] as string;
    const text = modes.texts[mode] as string;
    const capturing = modes.capturing[mode] as boolean;

    vscode.commands.executeCommand("setContext", "modalcode.mode", name);
    status_bar_item.text = text;

    if (capturing) {
        if (type_subscription !== undefined) {
            return;
        }

        try {
            type_subscription = vscode.commands.registerCommand("type", () => {
                // disabling the 'type' command
            });
        } catch {
            vscode.window.showErrorMessage("ModalCode: the 'type' command is already registered");
        }
    } else {
        if (type_subscription !== undefined) {
            type_subscription.dispose();
            type_subscription = undefined;
        }
    }
}

function enter_mode(mode_name: string | undefined): void {
    if (mode_name === undefined) {
        vscode.window.showInformationMessage("ModalCode: no mode selected");
        return;
    }

    let selected_starting_mode: Mode | undefined;
    for (const [mode_index, name] of modes.names.entries()) {
        if (name === mode_name) {
            selected_starting_mode = mode_index;
            break;
        }
    }
    if (selected_starting_mode === undefined) {
        vscode.window.showErrorMessage(`ModalCode: mode '${mode_name}' not found`);
        return;
    }
    change_mode(selected_starting_mode);
}

async function change_mode_user_command(): Promise<void> {
    const selected_mode = await vscode.window.showQuickPick(modes.names, {
        canPickMany: false,
        title: "Change mode",
        placeHolder: "Enter mode to select",
    });
    enter_mode(selected_mode);
}

type ModeProperties = {
    readonly name: string;
    readonly icon?: string;
    readonly capturing: boolean;
}

type Mode = number;

class Modes {
    public constructor(
        public readonly names: string[],
        public readonly texts: string[],
        public readonly capturing: boolean[],
    ) {
        // I don't know why POJOs need constructors
    }
}
