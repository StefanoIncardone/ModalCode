import * as vscode from 'vscode';
import { statusBarItem, modes, currentMode, enterCommands } from "./modes/modes";

// TODO check if other extensions are capturing type events
// TODO add possibility to not activate the extensione if no keybindings are found
export function activate( context: vscode.ExtensionContext ) {
    statusBarItem.show();
    context.subscriptions.push(
        statusBarItem,
        // TODO put every command in an array to be disposed afterwards
        vscode.commands.registerCommand( 'type', keypress => handleKeypress( keypress.text ) ),
    );

    vscode.commands.executeCommand( "setContext", "vimcode.active", true );
}

export function deactivate() {
    for( const command of enterCommands ) {
        command.dispose();
    }

    statusBarItem.hide();
    statusBarItem.dispose();
}


function handleKeypress( key: string ): void {
    modes[ currentMode ].execute( key );
}
