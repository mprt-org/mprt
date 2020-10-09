import {start as agentStart} from 'https://unpkg.com/@mprt/agent@0.0.6/index.js'

export async function start(app, swUrl, scope='/') {
    await agentStart(app, swUrl, scope)
    window.process = {env: {}}
    for (const s of document.getElementsByTagName('script')) {
        if (s.type === 'mprt/module') {
            const n = s.cloneNode()
            n.type = 'module'
            s.replaceWith(n)
        }
    }
}

const myUrl = new URL(import.meta.url)
const app = myUrl.searchParams.get('app')
const swUrl = myUrl.searchParams.get('swUrl')
if (app && swUrl)
    start(app, swUrl)
