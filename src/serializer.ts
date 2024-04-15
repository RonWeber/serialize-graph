
var knownTypes: Map<string, {new (...args: any[]): {}}> = new Map();
const typeNameKey = "__type"
export const idKey = "__id"

function serialDecorator<T extends {new (...args: any[]): {}} >(constructor: T, name: string) {
    const serializationResult = class extends constructor {
        __type = name
    }
    knownTypes.set(name, serializationResult)
    return serializationResult    
}

export function serializeAs<T extends {new (...args: any[]): {}} >(name:string){
    return (target: T) => {
        return serialDecorator<T>(target, name) as any
    }
}

export function serializeType<T extends {new (...args: any[]): {}} >(constructor: T) {
    return serialDecorator(constructor, constructor.name) 
}

function isDirectlySerializableNativeType(thing: any): boolean {
    return typeof(thing) !== "object"
}

/* Serialization steps are as follows:
1. Walk the object graph, marking every object with an id.
2. Walk the graph again, creating a dummy object for each real object.
3. Walk the graph again, removing the ids.
3. Call JSON.stringify on the array of dummy objects.
*/
function dumbify(thing: any):any {
    if (isDirectlySerializableNativeType(thing)) {
        return thing
    } else if (Array.isArray(thing)) {
        return thing.map((value) => dumbify(value))
    } else if (thing instanceof Map) {
        return {
            __ImAMap: true,
            keys: Array.from(thing.keys()).map((value) => dumbify(value)),
            values: Array.from(thing.values()).map((value) => dumbify(value)),
        }
    } else if (thing instanceof Set) {
        return {
            __ImASet: true,
            entries: Array.from(thing.entries()).map((value) => dumbify(value))
        }
    } else if (thing instanceof Date) {
        return {
            __ImADate: true,
            date: thing.toISOString()
        }
    } else if (thing === null) {
        return null
    } else {
        // We've determined it's a regular object by elimination (I hope).
        return {
            ObjID: thing[idKey]
        }
    }
}

export function toDumbObjectArray(target: object): object[] {
    var highestId = 0
    function walkObjectGraph(graph: any, actionFn: (obj: any) => void, visitedFn: (obj: any) => boolean) {
        if (isDirectlySerializableNativeType(graph)) {
            return
        } else if (Array.isArray(graph)) {
            for (const member of graph) {
                walkObjectGraph(member, actionFn, visitedFn)
            }
        } else if (graph instanceof Map) {
            for (const member of graph.keys()) {
                walkObjectGraph(member, actionFn, visitedFn)
            }
            for (const member of graph.values()) {
                walkObjectGraph(member, actionFn, visitedFn)
            }
        } else if (graph instanceof Set) {
            for (const member of graph.entries()) {
                walkObjectGraph(member, actionFn, visitedFn)
            }
        } else if (graph === null) {
            return
        } else {
            // We've determined it's a regular object by elimination (I hope).
            if (visitedFn(graph)) {
                return
            }
            actionFn(graph)
            for (const key in graph) {
                walkObjectGraph(graph[key], actionFn, visitedFn)
            }
        }
    }

    // Mark every object with an ID.
    walkObjectGraph(target, function(obj) {
        obj[idKey] = highestId
        highestId = highestId + 1
    }, function(obj) {
        return idKey in obj
    })

    // Build a dumb object for every id.
    let dumbArray:object[] = []
    walkObjectGraph(target, function(obj) {
        let dumbObj:any = {}
        for (const key in obj) {
            if (key === idKey) {
                continue
            }
            dumbObj[key] = dumbify(obj[key])
        }
        dumbArray[obj[idKey]] = dumbObj
    }, (obj) => dumbArray[obj[idKey]] !== undefined)

    // Remove the superflous ID keys.
    walkObjectGraph(target, function(obj) {
        delete obj[idKey]
    }, function(obj) {
        return !(idKey in obj)
    })
    return dumbArray
}

export function stringify(object: any):string {
    return JSON.stringify(toDumbObjectArray(object))
}

/* Deserialization steps are as follows:
1. Call JSON.parse on the string of dummy objects.
2. For each object in the array, create a new object of the correct type (don't populate it yet)
3. For each object in the array, populate it with all constants, and correct references to other objects where the dummys were.
*/

function smartify(thing:any, outObjects:any[]):any {
    if (isDirectlySerializableNativeType(thing)) {
        return thing
    } else if (thing === null) {
        return null
    } else if (Array.isArray(thing)){
        return thing.map((value) => smartify(value, outObjects))
    } else if (thing.__ImAMap) {
        let keys:any[] = thing.keys.map((value:any) => smartify(value, outObjects))
        let values:any[] = thing.values.map((value:any) => smartify(value, outObjects))
        let result = new Map()
        for (let i = 0; i < keys.length; i++) {
            result.set(keys[i], values[i])
        }
        return result
    } else if (thing.__ImASet) {
        let entries:any[] = thing.entries.map((value:any) => smartify(value, outObjects))
        return new Set(entries)
    } else if (thing.__ImADate) {
        return new Date(thing.date)
    } else if ("ObjID" in thing) {
        return outObjects[thing.ObjID]
    } else {
        // ¯\_(ツ)_/¯
        return thing
    }
}

function smartifyObj(dumbObj: any, smartObj:any, outObjects:any[]) {
    for (const key in dumbObj) {
        smartObj[key] = smartify(dumbObj[key], outObjects)
    }
}

export function fromDumbObjectArray(dumbs: any[], notice: (warning:string) => void | undefined):any {
    let outObjects:any[] = []
    // Make a bunch of empty objects.
    for(let i = 0; i < dumbs.length; i++) {
        if (typeNameKey in dumbs[i]) {
            const typeName:string = dumbs[i][typeNameKey]
            const type = knownTypes.get(typeName)
            if (!type) {
                notice("An object has type " + typeName + ", which we don't know about.  Deserializing as object.")
                outObjects[i] = {}
            } else {
                // Yes, this will invoke a constructor with undefined as all the args.
                // So sue me.
                outObjects[i] = new type()
            }
        } else {
            notice("Object " + JSON.stringify(dumbs[i]) +" has no type.  Serializing as object")
            outObjects[i] = {}
        }
    }

    // Populate those objects
    for(let i = 0; i < dumbs.length; i++) {
        smartifyObj(dumbs[i], outObjects[i], outObjects)
    }

    return outObjects[0]
}

export function parse(string: string, notice?: (warning:string) => void):any {
    if (!notice) notice = (s) => {}
    return fromDumbObjectArray(JSON.parse(string), notice)
}