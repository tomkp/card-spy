import React from 'react';
import Indicator from '../indicator/Indicator';
import DeviceSelector from '../device-selector/DeviceSelector';
import './status-bar.scss';

export default ({device, devices, onSelectDevice, card}) => {
    return <div className="status-bar">
        <Indicator name="device-status" status={device?'activated':'deactivated'} title={device?'Device activated':'Device deactivated'} />
        <Indicator name="card-status" status={card?'inserted':'removed'} title={card?'Card inserted':'Card removed'} />
        <span className="atr" title="ATR (Answer To Reset)">{card?card:''}</span>
        <span className="device">{device?device:''}</span>
    </div>
};

//<DeviceSelector currentDevice={device} devices={devices} onSelect={onSelectDevice} />
