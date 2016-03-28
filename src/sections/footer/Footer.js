import React from 'react';
import Status from './status/Status';
import './footer.scss';

export default ({device, card}) => {
    return <div className="footer">
        <span className="reader">{device?device.name:''}</span>
        <span className="atr" title="ATR (Answer To Reset)">{card?card:''}</span>
        <Status name="device-status" status={device?'activated':'deactivated'} title={device?'Device activated':'Device deactivated'} />
        <Status name="card-status" status={card?'inserted':'removed'} title={card?'Card inserted':'Card removed'} />
    </div>
};
