import React from 'react';
import './command-response.scss';
import hexify from 'hexify';

export default ({response}) => {

    //console.info(response.getStatusCode());
    //console.info(response.isOk());
    return <div className={'response' + response.isOk()?'ok':'error'}>&lt; {response.toString('ascii')}</div>
};