import { parse, stringify, toDumbObjectArray } from "./serializer";

export {}

test("Dumb objects work as intended", () => {
    const testObj1 = {
        string: "String",
        number: 8,
    }
    const testObj0 = {
        string: "'Sup",
        child: testObj1,
    }
    const result = toDumbObjectArray(testObj0) as any[]
    expect(result[0].string).toEqual("'Sup")
    expect(result[0].child.ObjID).toEqual(1)
    expect(result[1].string).toEqual("String")
    expect(result[1].number).toEqual(8)
});

test("Dumb objects work as intended with maps/sets/arrays", () => {
    const onlyChild = {}
    let map = new Map()
    map.set(onlyChild, 5)
    map.set(6, onlyChild)
    let set = new Set()
    set.add(onlyChild)
    const parent = {
        array: [onlyChild, 2, 3],
        map: map,
        set: set,
        date: new Date(2022, 2, 7, 10, 26)
    }
    const result = toDumbObjectArray(parent) as any[]
    expect(result[0].array[1]).toEqual(2)
    expect(result[0].array[0].ObjID).toEqual(1)
    expect(result[0].map.__ImAMap).toBeTruthy()
    expect(result[0].map.keys[0].ObjID).toEqual(1)
    expect(result[0].map.values[0]).toEqual(5)
    expect(result[0].set.__ImASet).toBeTruthy()
    expect(result[0].date.__ImADate).toBeTruthy()
})

test("Basic serialization and deserialization", () => {
    const testObj1 = {
        string: "String",
        number: 8,
    }
    const testObj0 = {
        string: "'Sup",
        child: testObj1,
    }
    const result = parse(stringify(testObj0))
    expect(result.string).toEqual("'Sup")
    expect(result.child.number).toEqual(8)
})

test("Serialization and deserialization with data structures", () => {
    const child1 = {num: 1}
    const child2 = {num: 2}
    const child3 = {num: 3}
    const child4 = {num: 4}
    let map = new Map()
    map.set(child1, 5)
    map.set(6, child2)
    let set = new Set()
    set.add(child3)
    const parent = {
        array: [child4, 2, 3],
        map: map,
        set: set,
        date: new Date(2022, 2, 7, 10, 26)
    }
    const result = parse(stringify(parent))
    expect(result.array[0].num).toEqual(4)
    expect(result.array[1]).toEqual(2)
    expect(result.map.get(6).num).toEqual(2)
    expect((result.set as Set<any>).has(child3))
    expect(result.date).toEqual(new Date(2022, 2, 7, 10, 26))
})
