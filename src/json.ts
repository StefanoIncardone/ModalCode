//# Generic type utilities

declare global {
    interface ArrayConstructor {
        isArray(a: unknown): a is unknown[];
    }
}

export type ArrayToUnion<T extends [unknown, ...unknown[]]> = (
    T extends [infer First extends unknown] ? (
        First
    ) :
    T extends [infer First extends unknown, ...infer Rest extends [unknown, ...unknown[]]] ? (
        First | ArrayToUnion<Rest>
    ) :
    (
        T
    )
);

export type IsSpecificTypeFn<Generic, Specific extends Generic> = (generic: Generic) => generic is Specific;

export type IsSpecificTypeFns<Generic, Specific extends [Generic, ...Generic[]]> = (
    Specific extends [infer First extends Generic] ? (
        [IsSpecificTypeFn<Generic, First>]
    ) :
    Specific extends [infer First extends Generic, ...infer Rest extends [Generic, ...Generic[]]] ? (
        [IsSpecificTypeFn<Generic, First>, ...IsSpecificTypeFns<Generic, Rest>]
    ) :
    (
        never
    )
);

//# Json type utilities

export type JsonString = string;
export type JsonNumber = number;
export type JsonBoolean = boolean;
export type JsonNull = null;
export type JsonArray = Json[];
export type JsonObject = { [key: string]: Json; };

export type JsonPrimitive = JsonString | JsonNumber | JsonBoolean | JsonNull;
export type JsonComposite = JsonArray | JsonObject;
export type Json = JsonPrimitive | JsonComposite;

export type JsonStringType = "string";
export type JsonNumberType = "number";
export type JsonBooleanType = "boolean";
export type JsonNullType = "null";
export type JsonArrayType = "array";
export type JsonObjectType = "object";

export type JsonPrimitiveType = JsonStringType | JsonNumberType | JsonBooleanType | JsonNullType;
export type JsonCompositeType = JsonArrayType | JsonObjectType;
export type JsonType = JsonPrimitiveType | JsonArrayType | JsonObjectType;

export type JsonTypeStringMap<J extends Json> = (
    J extends JsonString ? JsonStringType
    : J extends JsonNumber ? JsonNumberType
    : J extends JsonBoolean ? JsonBooleanType
    : J extends JsonNull ? JsonNullType
    : J extends JsonArray ? JsonArrayType
    : J extends JsonObject ? JsonObjectType
    : never
)

export function type_name<J extends Json>(json: J): JsonTypeStringMap<J> {
    return typeof json as JsonTypeStringMap<J>;
}

//## Type assertions

export function is_string(json: Json): json is string {
    return typeof json === "string";
}

export function is_number(json: Json): json is number {
    return typeof json === "number";
}

export function is_boolean(json: Json): json is boolean {
    return typeof json === "boolean";
}

export function is_null(json: Json): json is null {
    return json === null;
}

export function is_primitive(json: Json): json is JsonPrimitive {
    return is_string(json) || is_number(json) || is_boolean(json) || is_null(json);
}

export function is_array(json: Json): json is JsonArray {
    return Array.isArray(json);
}

export function is_object(json: Json): json is JsonObject {
    return typeof json === "object";
}

export function is_composite(json: Json): json is JsonComposite {
    return is_array(json) || is_object(json);
}

//# Property lookup

export type GetResult<Generic, Specific extends Generic> = {
    is_correct_type: true,
    property: Specific;
} | {
    is_correct_type: false,
    property: Exclude<Generic, Specific>;
};

export function has<O extends JsonObject, K extends string>(json: O, property_name: K): json is typeof json & { [P in K]: Json } {
    return Object.hasOwn(json, property_name);
}

export function get<T extends Json>(
    json: JsonObject,
    property_name: string,
    is_specific_type: IsSpecificTypeFn<Json, T>,
): GetResult<Json, T> | undefined {
    const property = json[property_name];
    if (property === undefined) return undefined;

    if (is_specific_type(property)) return { is_correct_type: true, property };
    return { is_correct_type: false, property: property as Exclude<Json, T> };
}

export function get_string(json: JsonObject, property_name: string): GetResult<Json, string> | undefined {
    return get(json, property_name, is_string);
}

export function get_number(json: JsonObject, property_name: string): GetResult<Json, number> | undefined {
    return get(json, property_name, is_number);
}

export function get_boolean(json: JsonObject, property_name: string): GetResult<Json, boolean> | undefined {
    return get(json, property_name, is_boolean);
}

export function get_null(json: JsonObject, property_name: string): GetResult<Json, null> | undefined {
    return get(json, property_name, is_null);
}

export function get_primitive(json: JsonObject, property_name: string): GetResult<Json, JsonPrimitive> | undefined {
    return get(json, property_name, is_primitive);
}

export function get_array(json: JsonObject, property_name: string): GetResult<Json, JsonArray> | undefined {
    return get(json, property_name, is_array);
}

export function get_object(json: JsonObject, property_name: string): GetResult<Json, JsonObject> | undefined {
    return get(json, property_name, is_object);
}

export function get_composite(json: JsonObject, property_name: string): GetResult<Json, JsonComposite> | undefined {
    return get(json, property_name, is_composite);
}

// TODO(stefano): make generic parameters inferrable from is_types: get_any({}, "foo", is_string, is_boolean) -> GetResult<Json, string | boolean> | undefined
export function get_any<const T extends [Json, ...Json[]]>(
    json: JsonObject,
    property_name: string,
    is_specific_types: IsSpecificTypeFns<Json, T>,
): GetResult<Json, ArrayToUnion<T>> | undefined {
    const property = json[property_name];
    if (property === undefined) return undefined;

    for (const is_specific_type of is_specific_types) {
        if (is_specific_type(property)) return { is_correct_type: true, property: property as ArrayToUnion<T> };
    }
    return { is_correct_type: false, property: property as Exclude<Json, ArrayToUnion<T>> };
}

//# Serialization/Deserialization

// TODO(stefano): give proper typing instead of unknown
export type ReplacerFn = (this: unknown, key: string, value: unknown) => unknown;
export type ReplacerValue = (string | number)[] | null;
export type Replacer = ReplacerFn | ReplacerValue;

export function to_string(json: JsonComposite, replacer?: Replacer, space?: string | number): string | TypeError {
    try {
        return JSON.stringify(json, replacer as ReplacerValue, space);
    } catch (error) {
        if (error instanceof TypeError) return error;
        return new TypeError("an error occoured during serialization");
    }
}

// TODO(stefano): give proper typing instead of unknown
export type ReviverFn = (this: unknown, key: string, value: unknown) => unknown;
export type Reviver = ReviverFn;

export function from_string(json: string, reviver?: Reviver): JsonComposite | SyntaxError {
    try {
        return JSON.parse(json, reviver) as JsonComposite;
    } catch (error) {
        if (error instanceof SyntaxError) return error;
        return new SyntaxError("an error occoured during parsing");
    }
}
