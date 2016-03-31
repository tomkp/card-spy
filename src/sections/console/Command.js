import React from 'react';
import './command-response.scss';
import hexify from 'hexify';

export default ({command}) => {
    return <div className="command" title="APDU Command Issued">{command.toString('hex')}</div>
};