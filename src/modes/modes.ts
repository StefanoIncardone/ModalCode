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

        let modes: Mode[] = [];

        let startingMode = 0;

        for( const [id, properties] of modeProperties.data.entries() ) {
            const mode = Mode.new( id, properties );
            modes.push( mode );

            const modeContextName = toPascalCase( properties.name );

            context.subscriptions.push(
                vscode.commands.registerTextEditorCommand( `vimcode.enter${modeContextName}`,
                    () => GlobalState.enterMode( id )
                )
            );

            if( properties.startingMode ) {
                startingMode = id;
            }
        }

        this.modes = modes;

        this.statusBarItem = vscode.window.createStatusBarItem( vscode.StatusBarAlignment.Left );
        this.statusBarItem.show();

        context.subscriptions.push( this.statusBarItem );

        this.enterMode( startingMode );

        vscode.commands.executeCommand( "setContext", "vimcode.active", true );
        vscode.window.showInformationMessage( "VimCode: activated succesfully!" );
    }


    public static enterMode( mode: number ): void {
        this.currentMode = this.modes[ mode ]
        this.statusBarItem.text = this.currentMode.text;
        this.currentMode.enter();
        // TODO add setting of context keys for each mode
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
    public readonly id: number;
    public readonly text: string;


    protected constructor( id: number, name: string, icon?: string ) {
        icon = icon === undefined ? "" : `$(${icon}) `;

        this.id = id;
        this.text = `-- ${icon}${name.toUpperCase()} --`;
    }

    public static new( id: number, properties: ModeProperties ): Mode {
        if( properties.keybindings === undefined ) {
            return new InsertMode( id, properties.name, properties.icon );
        }
        else {
            return new NormalMode( id, properties.name, properties.keybindings, properties.icon );
        }
    }


    public abstract enter(): void;
}

class InsertMode extends Mode {
    public override enter(): void {
        GlobalState.typeSubscription?.dispose();
        GlobalState.typeSubscription = undefined;
    }
}

class NormalMode extends Mode {
    public readonly keybinds: Keybind[];


    public constructor( id: number, name: string, keybinds: Keybind[], icon?: string ) {
        super( id, name, icon );

        this.keybinds = keybinds;
    }


    public execute( key: string ): void {
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
                GlobalState.typeSubscription = vscode.commands.registerCommand( "type", keypress => this.execute( keypress.text ) );
            }
            catch {
                vscode.window.showErrorMessage( 'VimCode: another extension is overwriting the "type" command!' );
            }
        }
    }
}
