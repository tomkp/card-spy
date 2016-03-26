import React from 'react';
import './command-response.scss';
import hexify from 'hexify';
import Command from './Command';
import Response from './Response';

export default ({command, response}) => {
    return (
        <div className="command-response">
            <Command command={command} />
            <Response response={response} />
        </div>
    )
};