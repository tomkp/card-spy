import React from 'react';
import './response.scss';

import Tlv from '../tlv/Tlv';

export default ({response, ok, meaning}) => {
    return (
        <div className={'response ' + (ok?'ok':'error')} title={`Response APDU`}>
            {response}
            {ok?<div className="tlv-wrapper"><Tlv data={response} /></div>:
                <span className="meaning">{meaning}</span>
            }
        </div>
    );
};