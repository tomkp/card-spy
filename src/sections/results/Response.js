import React from 'react';
import './command-response.scss';
import hexify from 'hexify';

export default ({response, ok, meaning}) => {
    return <div className={'response ' + (ok?'ok':'error')} title={meaning}>&lt; {response}</div>
};