import React from 'react';
import './command-response.scss';
import hexify from 'hexify';

export default ({command}) => {
    return <div className="command">&gt; {command.toString('hex')}</div>
};