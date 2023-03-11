import * as vscode from 'vscode';
import { GlobalState } from "./modes/modes";


// TODO check if other extensions are capturing type events
export function activate( context: vscode.ExtensionContext ) {
    GlobalState.init( context );
}

export function deactivate() {
    vscode.commands.executeCommand( "setContext", "vimcode.active", false );
    GlobalState.typeSubscription?.dispose();
}
