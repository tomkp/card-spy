import React from 'react';

import './command-response.scss';
import Tlv from './tlv/Tlv';

export default ({response, ok, meaning}) => {
    return (
        <div className={'response ' + (ok?'ok':'error')} title={`Response APDU`}>
            {response}
            {ok?<Tlv data={response} />:
                <span className="meaning">{meaning}</span>
            }
        </div>
    );
};