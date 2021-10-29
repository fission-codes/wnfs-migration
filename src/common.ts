// This module is filesystem-version agnostic.
// It should not depend on specific webnative versions. (Keep its imports clean!)
// This is in contrast to the modules in versions/, which should be webnative-version specific.

export type FileContent = Uint8Array | Record<string, unknown> | string | number | boolean

export type Entry
    = { path: string[]; isFile: true; content: FileContent }
    | { path: string[]; isFile: false }
