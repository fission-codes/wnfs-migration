# WNFS-Migration

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/fission-suite/blob/master/LICENSE)
[![Discord](https://img.shields.io/discord/478735028319158273.svg)](https://discord.gg/zAQBDEq)
[![Discourse](https://img.shields.io/discourse/https/talk.fission.codes/topics)](https://talk.fission.codes)

This is a command-line-interface tool to help you upgrade your filesystem from older versions of WNFS to newer versions.

## Usage

```shell
# make sure you've linked your browser account to your CLI
$ fission setup
🌱 Setting up environment
🪐 Downloading managed IPFS for Linux
🎛️ Configuring managed IPFS
🔑 Setting up keys
🏠 Do you have an existing account? [Y/n] Y
🔗 Please open auth.fission.codes on a signed-in device
📛 Please enter your username: <your username>
🔢 Confirmation code: [2, 1, 1, 6, 0, 7]
🎛️ Initializing user config file
✅ Done! Welcome to Fission, <your username> ✨
# make sure you've installed npm (npmjs.com)
$ npm install wnfs-migration
$ wnfs-migration
```

## Versions

Here's a table of what versions of WNFS different versions of `wnfs-migration` help you migrate to.
The current row will always help you migrate to a WNFS version from the row above. 

| WNFS version | webnative version | `wnfs-migration` version |
|-------------:|------------------:|-------------------------:|
|        1.0.0 |   0.20.0 - 0.29.2 |          -none-          |
|        2.0.0 |  0.30.0 - current |                    2.0.0 |
