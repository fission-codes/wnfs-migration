import type { IPFS } from "ipfs-core"
import { CID } from "multiformats"
import * as webnative from "webnative-0.29.0"
import * as ipfsConfig from "webnative-0.29.0/ipfs/config.js"
import * as setup from "webnative-0.29.0/setup.js"
import * as identifiers from "webnative-0.29.0/common/identifiers.js"
import * as path from "webnative-0.29.0/path.js"
import FileSystem from "webnative-0.29.0/fs/filesystem.js"
import * as nodeImplementation from "./setup-node-keystore.js"

setup.setDependencies(nodeImplementation as any)

export type Entry
    = { path: string[]; isFile: true; content: webnative.ipfs.FileContent }
    | { path: string[]; isFile: false }

export async function* traverseFileSystem(ipfs: IPFS, rootWNFSCID: CID, readKey: string): AsyncGenerator<Entry, void> {
    ipfsConfig.set(ipfs)
    await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))
    const filesystem = await FileSystem.fromCID(rootWNFSCID.toString(), {
        localOnly: true,
        permissions: {
            fs: {
                public: [path.root()],
                private: [path.root()]
            }
        }
    })

    if (filesystem == null) throw "Couldn't load WNFS"

    yield* traverseEntries(["public"], filesystem)
    yield* traverseEntries(["private"], filesystem)
}

async function* traverseEntries(pathSoFar: string[], fs: FileSystem): AsyncGenerator<Entry, void> {
    for (const [name, entry] of Object.entries(await fs.ls(path.directory(...pathSoFar)))) {
        const entryPath = [...pathSoFar, name]
        if (entry.isFile) {
            const content = await fs.read(path.file(...entryPath))
            if (content == null) {
                console.warn(`Missing file content at ${entryPath}`)
            } else yield {
                path: entryPath,
                isFile: true,
                content
            }
        } else {
            yield {
                path: entryPath,
                isFile: false,
            }
            yield* traverseEntries(entryPath, fs)
        }
    }
}
