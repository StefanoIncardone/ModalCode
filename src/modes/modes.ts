// TODO create global state class

import * as vscode from "vscode";
import { Command } from "../commands/commands";


interface ModeConfig {
    name: string,
    icon?: string,
    restrictedInsert?: boolean,
    commands: Command[]
}


abstract class Mode {
    readonly id: number;
    readonly name: string;
    readonly text: string;
    readonly commands: Command[];

    constructor( id: number, name: string, commands: Command[], icon?: string ) {
        this.id = id;
        this.name = name;

        icon = icon === undefined ? " " : ` $(${icon}) `;
        this.text = `--${icon}${name.toUpperCase()} --`;
        this.commands = commands;
    }

    public enter(): void {
        currentMode = this.id;
        statusBarItem.text = this.text;
    }

    abstract execute( key: string ): void;
}

class UnrestrictedInsertMode extends Mode {
    override execute( key: string ): void {
        // TODO try to avoid checking for the active text editor each time
        let editor = vscode.window.activeTextEditor;
        if( !editor ) {
            return;
        }

        vscode.window.showInformationMessage( `VimCode: typing "${key}"` );

        let cursorPosition = editor.selection.active;
        editor.edit( editorBuilder => editorBuilder.insert( cursorPosition, key ) );
    }
}

class RestrictedInsertMode extends Mode {
    override execute( key: string ): void {
        // TODO transition to better searching method
        for( const command of this.commands ) {
            if( key === command.key ) {
                vscode.window.showInformationMessage( `VimCode: found command for "${key}"` );

                vscode.commands.executeCommand( command.command );
            }
        }

        vscode.window.showErrorMessage( `VimCode: command not found for "${key}"` );
    }
}

// TODO move to the extension.ts file or a separe initializer file
function initializeModes(): [vscode.StatusBarItem, Mode[], number, vscode.Disposable[]] {
    let settings = vscode.workspace.getConfiguration( "vimcode" );
    let definedModes = settings.get<ModeConfig[]>( "modes" );

    let modes: Mode[] = [];
    let enterCommands: vscode.Disposable[] = [];

    if( definedModes ) {
        for( const [id, mode] of definedModes.entries() ) {
            let currentMode: Mode;
            let commands: Command[] = [];

            for( const command of mode.commands ) {
                commands.push( command );
            }

            if( "restrictedInsert" in mode && !mode.restrictedInsert ) {
                currentMode = new UnrestrictedInsertMode( id, mode.name, commands, mode.icon );
            }
            else {
                currentMode = new RestrictedInsertMode( id, mode.name, commands, mode.icon );
            }

            modes.push( currentMode );

            // TODO move to the commands module
            // TODO find better naming convention for modes
            enterCommands.push( vscode.commands.registerTextEditorCommand( `vimcode.enter${currentMode.name}`, () => {
                modes[ id ].enter()
            } ) );
        }
    }

    let currentMode = 0;

    let statusBarItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left );
    statusBarItem.text = modes[ currentMode ].text;

    return [statusBarItem, modes, currentMode, enterCommands];
}


export let [statusBarItem, modes, currentMode, enterCommands] = initializeModes();
