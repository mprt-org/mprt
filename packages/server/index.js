#!/usr/bin/env node
const y = require('yargs')
    .command(['$0', 'serve'], 'Start the server', {
        port: {
            alias: 'p',
            type: 'number',
            default: 8000,
            description: 'Port to bind on'
        }
    }, (argv) => {
        console.info(`Start server on :${argv.port}`)
        require('./serve').serve(argv.port)
    })
    .command('install', 'Install web_modules', async () => {
        await require('./install').install()
    })
    .strict()
    .demandCommand()
    .help()
    .argv
