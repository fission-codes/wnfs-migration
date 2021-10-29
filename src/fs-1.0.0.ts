// package imports
import type { IPFS } from "ipfs-core"
import { CID } from "multiformats"
// webnative imports
import * as webnative from "webnative-0.29.0"
import * as ipfsConfig from "webnative-0.29.0/ipfs/config.js"
import * as setup from "webnative-0.29.0/setup.js"
import * as identifiers from "webnative-0.29.0/common/identifiers.js"
import * as path from "webnative-0.29.0/path.js"
import { isBlob } from "webnative-0.29.0/common/index.js"
import FileSystem from "webnative-0.29.0/fs/filesystem.js"
// relative imports
import { nodeImplementation } from "./setup-node-keystore.js"
import { Entry } from "./common.js"


setup.setDependencies(nodeImplementation)

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
        // not sure why this happens
        if (name == null || name.length == null || name.length == 0) continue
        
        const entryPath = [...pathSoFar, name]
        if (entry.isFile) {
            const content = await fs.read(path.file(...entryPath))
            if (content == null) {
                console.warn(`Missing file content at ${entryPath}`)
            } else if (isBlob(content)) {
                console.warn(`Retrieved file as Blob. We can't handle that. At ${entryPath}`)
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
            try {
                yield* traverseEntries(entryPath, fs)
            } catch (e) {
                console.error(`Skipping some paths in ${path.toPosix(path.directory(...entryPath))} due to errors` + (e instanceof Error ? ` ("${e.message}").` : ","))
            }
        }
    }
}

export async function filesystemFromEntries(entryStream: AsyncIterable<Entry>, ipfs: IPFS, readKey: string): Promise<CID> {
    ipfsConfig.set(ipfs)

    await webnative.crypto.keystore.importSymmKey(readKey, await identifiers.readKey({ path: path.directory("private") }))

    const filesystem = await FileSystem.empty({ rootKey: readKey, localOnly: true, permissions: {
        fs: {
            private: [path.root()],
            public: [path.root()],
        }
    }})

    for await (const entry of entryStream) {
        try {
            if (entry.isFile) {
                await filesystem.write(path.file(...entry.path), entry.content)
            } else {
                await filesystem.mkdir(path.directory(...entry.path))
            }
        } catch (e) {
            console.error(`Error while trying to process ${path.toPosix(path.file(...entry.path))}` + (e instanceof Error ? ` ("${e.message}")` : "") + " continuing.")
        }
    }

    return CID.parse(await filesystem.root.put())
}
