import React from 'react';
import Status from './status/Status';
import './footer.scss';

export default ({reader, atr, deviceStatus, cardStatus}) => {
    return <div className="footer">
        <span className="reader">{reader?reader.name:''}</span>
        <span className="atr" title="ATR (Answer To Reset)">{atr?atr.toString('hex'):''}</span>
        <Status name="device-status" status={deviceStatus} />
        <Status name="card-status" status={cardStatus} />
    </div>
};
