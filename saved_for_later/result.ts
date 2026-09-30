class Ok<O> {
    constructor(public readonly value: O) {}
}

class Err<E> {
    constructor(public readonly err: E) {}
}

type Result<O, E> = Ok<O> | Err<E>;


namespace ConfigError {
    export class Null {
        public toString(): string {
            return "ModalCode: 'modalcode.modes' cannot be null";
        }
    }

}

type TypeKind = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";
type TypeKindExt = TypeKind | "array";

class TypeMismatchError {
    constructor(
        public readonly expected: TypeKindExt,
        public readonly actual: TypeKindExt,
    ) {}

    public toString(): string {
        return "ModalCode: 'modalcode.modes' cannot be null";
    }
}

type ConfigError = ConfigError.Null;

function get_config(): Result<unknown[] | undefined, ConfigError> {
    const modalcode_modes = vsc_workspace.getConfiguration("modalcode").get("modes");
    if (modalcode_modes === undefined)   return new Ok(undefined);
    if (modalcode_modes === null)        return new Err(new ConfigError.Null());
    if (!Array.isArray(modalcode_modes)) return new Err(new TypeMismatchError('array', typeof modalcode_modes))
    if (modalcode_modes.length === 0)    return new Ok(undefined);
                                         return new Ok(modalcode_modes);
}
