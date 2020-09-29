import React, {createElement} from 'react'
import { render } from 'react-dom'

import Hello from '/components/Hello'

// import './styles.module.css'

class RootScreen extends React.Component {
    render() {
        return (
            <Hello />
        )
    }
}

export function draw(root) {
    return new Promise(ok => render(createElement(RootScreen), root, ok))
}
