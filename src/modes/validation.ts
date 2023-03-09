import { z } from "zod";


const lowerCaseAndSpaces = /^[a-z ]*$/;
const kebabCase = /^[a-z]+(?:-[a-z]+)*$/;
const singleLettersAndSpaces = /^[\D]$/;

const KeybindProperties = z.object( {
    // we only allow single keys as valid commands
    // TODO add possibility to define keys with Ctrl/alt/leader
    key: z.string()
        .regex( singleLettersAndSpaces, "VimCode: only single characters and spaces allowed!" ),
    command: z.string().trim().min( 1 ),
} ).strict();

type KeybindProperties = z.infer<typeof KeybindProperties>;


export const ModeProperties = z.object( {
    name: z.string().trim().min( 1 ).max( 16 )
            .regex( lowerCaseAndSpaces, "VimCode: only lower case characters and spaces allowed!" ),
    icon: z.string().trim().min( 1 )
            .regex( kebabCase, "VimCode: only kebab-case names allowed!" ).optional(),
    startingMode: z.boolean().default( false ),
    keybindings: KeybindProperties.array().optional(),
} ).strict();

export type ModeProperties = z.infer<typeof ModeProperties>;


export const ModeConfig = ModeProperties.array()
    .nonempty( { message: "VimCode: no modes were defined!" } )
    .superRefine( (values, context) => {
        const encounteredModes = new Map<string, number[]>();

        for( const [i, mode] of values.entries() ) {
            if( !encounteredModes.has( mode.name ) ) {
                encounteredModes.set( mode.name, [] );
            }

            encounteredModes.get( mode.name )!.push( i );
        }

        for( const [mode, occurrencies] of encounteredModes ) {
            if( occurrencies.length > 1 ) {
                context.addIssue( {
                    code: z.ZodIssueCode.custom,
                    message: `VimCode: no duplicate modes allowed! ["${mode}"]`,
                    path: occurrencies
                } );
            }
        }
    } );

export type ModeConfig = z.infer<typeof ModeConfig>;


const customErrorMap: z.ZodErrorMap = (issue, context) => {
    switch( issue.code ) {
        case z.ZodIssueCode.invalid_type:
            let invalidKey = issue.path.at( -1 );

            if( issue.received === "undefined" ) {
                return { message: `VimCode: missing property! ["${invalidKey}"]` };
            }

            let invalidType = `property: "${invalidKey}", expected: "${issue.expected}", received: "${issue.received}"`;

            return { message: `VimCode: wrong property type! [${invalidType}]` };
        case z.ZodIssueCode.unrecognized_keys:
            let unexpectedKeys = issue.keys.map( key => `"${key}"` ).join( ", " );

            return { message: `VimCode: unexpected properties! [${unexpectedKeys}]` };
        case z.ZodIssueCode.custom:
            return { message: issue.message || "VimCode: unexpected error!" };
        default:
            return { message: `VimCode: unexpected error! [${context.defaultError}]` };
    }
};

z.setErrorMap( customErrorMap );
