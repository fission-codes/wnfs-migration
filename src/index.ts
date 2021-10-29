import * as cli from "./cli/index.js"

try {
    await cli.run()
} catch (e) {
    if (!(e instanceof Error)) {
        throw e
    }
    console.error(e.message)
}
