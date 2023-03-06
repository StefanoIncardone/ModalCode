import { z } from "zod";

export class Keybind {
    readonly key: string;
    readonly command: string;


    constructor( key: string, command: string ) {
        this.key = key;
        this.command = command;
    }
}


const singleLettersAndSpaces = /^[\D]$/;

export const KeybindProperties = z.object( {
    // we only allow single keys as valid commands
    // TODO add possibility to define keys with Ctrl/alt/leader and escape sequences such as "\n"
    key: z.string().regex( singleLettersAndSpaces ),
    command: z.string().trim(),
} ).strict();

export type KeybindProperties = z.infer<typeof KeybindProperties>;
