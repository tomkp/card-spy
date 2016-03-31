import React from 'react';
import './command-response.scss';
import hexify from 'hexify';
import Command from './Command';
import Response from './Response';

export default ({command, response, ok, meaning}) => {
    return (
        <div className="command-response">
            <Command command={command} />
            <Response response={response} ok={ok} meaning={meaning} />
        </div>
    )
};