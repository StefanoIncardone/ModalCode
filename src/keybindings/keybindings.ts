export class Keybind {
    readonly key: string;
    readonly command: string;


    constructor( key: string, command: string ) {
        this.key = key;
        this.command = command;
    }
}
