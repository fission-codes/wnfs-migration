import inquirer from "inquirer"
import * as webnative from "webnative-0.30.0"

console.log(remoteFromParam())

const answers = await inquirer.prompt([
    {
        type: "input",
        name: "username",
        message: "What's your fission username?",
        validate: async username => {
            if (!webnative.lobby.isUsernameValid(username)) {
                return "That's not a valid fission username. Is there a typo perhaps?"
            }
            // if (await webnative.lobby.isUsernameAvailable(username)) {
                return true
            // }
            // return "Couldn't find a user with this username. Is there a typo perhaps?"
        },
    }
])

console.log(answers)

function remoteFromParam() {
    const def = webnative.setup.endpoints({}).api
    let remote
    let idx
    idx = process.argv.indexOf("-R")
    if (idx != -1) {
        remote = process.argv[idx + 1]
    }
    idx = process.argv.indexOf("--remote")
    if (idx != -1) {
        remote = process.argv[idx + 1]
    }
    if (remote === "production") {
        return "https://runfission.com"
    }
    if (remote === "staging") {
        return "https://runfission.net"
    }
    return remote || def
}
