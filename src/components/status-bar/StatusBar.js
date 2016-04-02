import React from 'react';
import Indicator from '../indicator/Indicator';
import './status-bar.scss';

export default ({device, card}) => {
    return <div className="status-bar">
        <Indicator name="device-status" status={device?'activated':'deactivated'} title={device?'Device activated':'Device deactivated'} />
        <Indicator name="card-status" status={card?'inserted':'removed'} title={card?'Card inserted':'Card removed'} />
        <span className="reader">{device?device.name:''}</span>
        <span className="atr" title="ATR (Answer To Reset)">{card?card:''}</span>
    </div>
};
