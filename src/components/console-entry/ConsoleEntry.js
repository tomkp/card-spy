import React from 'react';
import Command from '../command/Command';
import Response from '../response/Response';
import './control-entry.scss';

export default ({command, response, ok, meaning}) => {
    return (
        <div className="console-entry">
            <Command command={command} />
            <Response response={response} ok={ok} meaning={meaning} />
        </div>
    )
};