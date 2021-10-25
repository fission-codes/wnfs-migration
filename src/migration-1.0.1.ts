/*

This migration added a small CBOR hull around private filesystem blocks.

They would now additionally store information about whether they're encrypted using
AES-GCM or AES-CTR. Previously everything was implicitly AES-CTR.

*/

import itAll from "it-all"
import itMap from "it-map" 
import * as fs from "fs"

import { createInMemoryIPFS } from "./in-memory-ipfs.js"
import * as fs_1_0_0 from "./fs-1.0.0.js"


const ipfs = await createInMemoryIPFS()

const [root] = await itAll(ipfs.dag.import(fs.createReadStream("./tests/fixtures/wnfs-1.0.1-example.car")))
if (root == null) {
    throw new Error(`Couldn't figure out root CID from given CAR file.`)
}
const wnfsCID = root.root.cid

console.log(`Loaded filesystem from CAR file: ${wnfsCID.toString()}`)

const readKey = "pJW/xgBGck9/ZXwQHNPhV3zSuqGlUpXiChxwigwvUws="

const migratedCID = await fs_1_0_0.filesystemFromEntries(
    itMap(fs_1_0_0.traverseFileSystem(ipfs, wnfsCID, readKey), async entry => {
        console.log(`Processing ${entry.path}`)
        return entry
    }),
    ipfs,
    readKey
)


console.log(`Finished migration: ${migratedCID}`)

// const carFile = "./migrated.car"
// const stream = fs.createWriteStream(carFile)
// for await (const chunk of ipfs.dag.export(CID.parse(migratedCID))) {
//     stream.write(chunk)
// }
// stream.close()

// console.log(`Wrote to ${carFile}`)

await ipfs.stop()
