import React from 'react';
import './command.scss';


export default ({command}) => {
    return <div className="command" title="APDU Command Issued">{command.toString('hex')}</div>
};