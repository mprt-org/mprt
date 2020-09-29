import React from 'react'
import {observer} from 'mobx-react'

import app from '/app'

import Button from '/components/Button/index'

import S from './styles.module.css'

@observer
export default class Hello extends React.Component {
    render() {
        return <>
            <div className={S.hello}>Hello! {app.count} {app.doubleCount}</div>
            <Button/>
        </>
    }
}
