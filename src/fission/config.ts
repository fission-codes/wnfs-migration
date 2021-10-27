export interface FissionConfig {
    ignore: string[]
    username: string
    root_proof: string | null
    server_did: string
    peers: string[]
    update_checked: Date
    signing_key_path: string
}

export function isFissionConfig(obj: unknown): obj is FissionConfig {
    return isRecord(obj)
        && hasProp(obj, "ignore") && Array.isArray(obj.ignore) && obj.ignore.every(i => typeof i === "string")
        && hasProp(obj, "username") && typeof obj.username === "string"
        && hasProp(obj, "root_proof") && (obj.root_proof === null || typeof obj.root_proof === "string")
        && hasProp(obj, "server_did") && typeof obj.server_did === "string"
        && hasProp(obj, "peers") && Array.isArray(obj.peers) && obj.peers.every(p => typeof p === "string")
        && hasProp(obj, "update_checked") && obj.update_checked instanceof Date
        && hasProp(obj, "signing_key_path") && typeof obj.signing_key_path === "string"
}

export function hasProp<K extends PropertyKey>(data: unknown, prop: K): data is Record<K, unknown> {
    return typeof data === "object" && data != null && prop in data
}

export function isRecord(data: unknown): data is Record<PropertyKey, unknown> {
    return typeof data === "object" && data != null
}
