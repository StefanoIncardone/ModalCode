import * as vscode from "vscode";
import { Keybind } from "../keybindings/keybindings";
import { ModeConfig, ModeProperties } from "./validation";


export abstract class GlobalState {
    public static currentMode: Mode;
    public static modes: Mode[];
    public static statusBarItem: vscode.StatusBarItem;
    public static typeSubscription: vscode.Disposable | undefined;


    private constructor() {}

    public static init( context: vscode.ExtensionContext ): void {
        const settings = vscode.workspace.getConfiguration( "vimcode" );
        const definedModes = settings.get( "modes" );
        const modeProperties = ModeConfig.safeParse( definedModes );
        if( !modeProperties.success ) {
            for( const issue of modeProperties.error.issues ) {
                vscode.window.showErrorMessage( issue.message );
            }

            vscode.window.showErrorMessage( "VimCode: extension not activated" );
            return;
        }

        this.modes = [];

        for( const [currentMode, properties] of modeProperties.data.entries() ) {
            const mode = Mode.new( properties );

            if( properties.startingMode ) {
                this.modes.unshift( mode );
            }
            else {
                this.modes.push( mode );
            }

            context.subscriptions.push(
                vscode.commands.registerCommand( `vimcode.enter${toPascalCase( properties.name )}`, () => {
                    GlobalState.enterMode( currentMode );
                } )
            );
        }

        this.statusBarItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left );
        this.statusBarItem.show();

        context.subscriptions.push( this.statusBarItem );

        this.enterMode( 0 );

        vscode.commands.executeCommand( "setContext", "vimcode.active", true );
        vscode.window.showInformationMessage( "VimCode: activated succesfully!" );
    }


    public static enterMode( mode: number ): void {
        this.currentMode = this.modes[ mode ];
        this.statusBarItem.text = this.currentMode.text;
        this.currentMode.enter();
    }
}

function toPascalCase( text: string ): string {
  return text.replace( /(^\w| \w)/g, clearAndUpper );
}

function clearAndUpper( text: string ): string {
  return text.replace( / /, "" ).toUpperCase();
}


// TODO move to composition model and mode factory
abstract class Mode {
    public readonly text: string;


    public constructor( name: string, icon?: string ) {
        icon = icon === undefined ? "" : `$(${icon}) `;
        this.text = `-- ${icon}${name.toUpperCase()} --`;
    }


    public static new( properties: ModeProperties ): Mode {
        if( properties.keybindings === undefined ) {
            return new InsertMode( properties.name, properties.icon );
        }
        else {
            return new NormalMode( properties.keybindings, properties.name, properties.icon );
        }
    }

    public abstract execute( key: string ): void;
    public abstract enter(): void;
}

class InsertMode extends Mode {
    public override execute( _key: string ): void {}

    public override enter(): void {
        GlobalState.typeSubscription?.dispose();
        GlobalState.typeSubscription = undefined;
    }
}

class NormalMode extends Mode {
    public readonly keybinds: Keybind[];


    public constructor( keybinds: Keybind[], name: string, icon?: string ) {
        super( name, icon );
        this.keybinds = keybinds;
    }


    public override execute( key: string ): void {
        // TODO transition to better searching method -> set
        for( const keybind of this.keybinds ) {
            if( key === keybind.key ) {
                vscode.commands.executeCommand( keybind.command );
                return;
            }
        }

        vscode.window.showErrorMessage( `VimCode: command not found for "${key}"` );
    }

    public override enter(): void {
        if( GlobalState.typeSubscription === undefined ) {
            try {
                GlobalState.typeSubscription = vscode.commands.registerCommand( "type", keypress =>
                    GlobalState.currentMode.execute( keypress.text )
                );
            }
            catch {
                vscode.window.showErrorMessage( 'VimCode: another extension is overwriting the "type" command!' );
            }
        }
    }
}
