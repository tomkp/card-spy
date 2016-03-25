import React from 'react';
import './command.scss';
import hexify from 'hexify';

export default ({command, response}) => {
    return (
        <div className="command-response">
            <div className="command">&gt; {command.toString('hex')}</div>
            <div className="response">&lt; {response.toString('ascii')}</div>
        </div>
    )
};